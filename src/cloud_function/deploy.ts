import { DeployData } from '@faasjs/func';
import deepMerge from '@faasjs/deep_merge';
import { loadTs } from '@faasjs/load';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { upload, remove } from './cos';
import scf from './scf';
import Tencentcloud from '..';

const defaults = {
  Handler: 'index.handler',
  MemorySize: 128,
  Timeout: 30,
  Runtime: 'Nodejs8.9'
};

export default async function deployCloudFunction (this: Tencentcloud, data: DeployData, origin: any) {
  this.logger.info('开始部署云函数');

  const config = deepMerge(origin);

  this.logger.debug('参数名适配');
  if (config.config.name) {
    config.config.FunctionName = config.config.name;
    delete config.config.name;
  } else {
    config.config.FunctionName = data.name!.replace(/[^a-zA-Z0-9-_]/g, '_');
  }
  if (config.config.memorySize) {
    config.config.MemorySize = config.config.memorySize;
    delete config.config.memorySize;
  }
  if (config.config.timeout) {
    config.config.Timeout = config.config.timeout;
    delete config.config.timeout;
  }

  this.logger.debug('合并配置项');
  config.config = deepMerge(defaults, config.config, {
    // 基本参数
    Region: config.provider.config.region,
    Namespace: data.env,
    Environment: {
      Variables: [
        {
          Key: 'FaasMode',
          Value: 'remote'
        },
        {
          Key: 'FaasEnv',
          Value: data.env
        }
      ]
    },

    // 构建参数
    filename: data.filename,
    name: data.name,
    version: data.version,
    env: data.env,
    dependencies: data.dependencies,
    tmp: data.tmp,

    // cos 参数
    Bucket: `scf-${config.provider.config.appId}`,
    FilePath: `${data.tmp}deploy.zip`,
    CosObjectName: config.config.FunctionName + '/' + data.version + '.zip'
  });

  this.logger.debug('完成参数处理 %o', config);

  this.logger.info('开始构建代码包');

  this.logger.debug('生成 index.js');
  await loadTs(config.config.filename, {
    output: {
      file: config.config.tmp + '/index.js',
      format: 'cjs',
      name: 'index',
      banner: `/**
 * @name ${config.config.name}
 * @author ${process.env.LOGNAME}
 * @build ${config.config.version}
 * @staging ${config.config.env}
 * @dependencies ${JSON.stringify(config.config.dependencies)}
 */`,
      footer: `
const main = module.exports;
main.config = ${JSON.stringify(data.config, null, 2)};
module.exports = main.export();`
    }
  });

  this.logger.debug('生成 package.json');
  const packageJSON = {
    dependencies: config.config.dependencies,
    private: true
  };
  writeFileSync(config.config.tmp + '/package.json', JSON.stringify(packageJSON));
  this.logger.debug('%o', packageJSON);

  this.logger.debug('安装 npm 包');
  execSync('yarn --cwd ' + config.config.tmp + ' install --production');

  this.logger.debug('打包 zip 文件');
  execSync(`cd ${config.config.tmp} && zip -r deploy.zip *`);

  this.logger.info('构建完成 %sdeploy.zip', config.config.tmp);


  this.logger.info('上传代码包');
  await upload.call(this, {
    Bucket: config.config.Bucket,
    FilePath: config.config.FilePath,
    Key: config.config.CosObjectName,
    Region: config.config.Region,
  });

  let scfInfo;

  try {
    this.logger.debug('检查云函数是否已存在');
    scfInfo = await scf.call(this, {
      Action: 'GetFunction',
      FunctionName: config.config.FunctionName,
      Namespace: config.config.Namespace,
    });

    this.logger.info('更新云函数代码');
    await scf.call(this, {
      Action: 'UpdateFunctionCode',
      CosBucketName: 'scf',
      CosBucketRegion: config.config.Region,
      CosObjectName: config.config.CosObjectName,
      FunctionName: config.config.FunctionName,
      Handler: config.config.Handler,
      Namespace: config.config.Namespace,
    });

    this.logger.info('更新云函数设置');
    await scf.call(this, {
      Action: 'UpdateFunctionConfiguration',
      Environment: config.config.Environment,
      FunctionName: config.config.FunctionName,
      MemorySize: config.config.MemorySize,
      Timeout: config.config.Timeout,
      VpcConfig: config.config.VpcConfig,
      Namespace: config.config.Namespace,
    });
  } catch (error) {
    if (error.Code === 'ResourceNotFound.FunctionName') {
      this.logger.info('创建云函数');
      await scf.call(this, {
        Action: 'CreateFunction',
        Code: {
          CosBucketName: 'scf',
          CosBucketRegion: config.config.Region,
          CosObjectName: config.config.CosObjectName,
        },
        Environment: config.config.Environment,
        FunctionName: config.config.FunctionName,
        Handler: config.config.Handler,
        Namespace: config.config.Namespace,
        MemorySize: config.config.MemorySize,
        Runtime: config.config.Runtime,
        Timeout: config.config.Timeout,
        VpcConfig: config.config.VpcConfig,
      });
    } else {
      throw error;
    }
  }

  this.logger.debug('删除代码包');
  await remove.call(this, {
    Bucket: config.config.Bucket,
    Key: config.config.CosObjectName,
    Region: config.config.Region,
  });

  this.logger.info('发布云函数版本');
  let res = await scf.call(this, {
    Action: 'PublishVersion',
    Description: `Published by ${process.env.LOGNAME}`,
    FunctionName: config.config.FunctionName,
    Namespace: config.config.Namespace
  });
  config.config.FunctionVersion = res.FunctionVersion;

  try {
    this.logger.debug('检查云函数别名是否已存在 %s', config.config.Namespace);
    res = await scf.call(this, {
      Action: 'GetAlias',
      Name: config.config.Namespace,
      FunctionName: config.config.FunctionName,
      Namespace: config.config.Namespace
    });

    await scf.call(this, {
      Action: 'UpdateAlias',
      Name: config.config.Namespace,
      FunctionName: config.config.FunctionName,
      Namespace: config.config.Namespace,
      FunctionVersion: config.config.FunctionVersion,
    });
  } catch (error) {
    if (error.Code === 'ResourceNotFound.Alias') {
      this.logger.info('发布云函数别名');
      await scf.call(this, {
        Action: 'CreateAlias',
        Name: config.config.Namespace,
        FunctionName: config.config.FunctionName,
        FunctionVersion: config.config.FunctionVersion,
        Namespace: config.config.Namespace
      });
    } else {
      throw error;
    }
  }

  this.logger.info('云函数发布完成 %s/%s@%s', config.config.Namespace, config.config.FunctionName, config.config.FunctionVersion);

  if (config.config.triggers) {
    this.logger.info('检查并删除旧触发器');
    if (scfInfo && scfInfo.Triggers.length) {
      for (const trigger of scfInfo.Triggers) {
        await scf.call(this, {
          Action: 'DeleteTrigger',
          FunctionName: config.config.FunctionName,
          Namespace: config.config.Namespace,
          TriggerName: trigger.TriggerName,
          Type: trigger.Type
        });
      }
    }
    const prevVersion = Number(config.config.FunctionVersion) - 1;
    if (prevVersion) {
      scfInfo = await scf.call(this, {
        Action: 'GetFunction',
        FunctionName: config.config.FunctionName,
        Namespace: config.config.Namespace,
        Qualifier: prevVersion,
      });
      if (scfInfo.Triggers.length) {
        for (const trigger of scfInfo.Triggers) {
          await scf.call(this, {
            Action: 'DeleteTrigger',
            FunctionName: config.config.FunctionName,
            Namespace: config.config.Namespace,
            Qualifier: prevVersion,
            TriggerName: trigger.TriggerName,
            Type: trigger.Type
          });
        }
      }
    }

    for (const trigger of config.config.triggers) {
      this.logger.info('发布触发器 %o', trigger);
      await scf.call(this, {
        Action: 'CreateTrigger',
        FunctionName: config.config.FunctionName,
        TriggerName: trigger.name,
        Type: trigger.type,
        TriggerDesc: trigger.value,
        Qualifier: config.config.FunctionVersion,
        Namespace: config.config.Namespace,
        Enable: 'OPEN'
      });
    }

    this.logger.info('触发器发布完成 %o', config.config.triggers);
  }
}
