import Logger from '@faasjs/logger';
import cos from './cos';
import scf from './scf';

export default async function (logger: Logger, provider: any, config: any) {
  logger.info('开始部署云函数');

  logger.info('上传代码包');
  await cos(provider, {
    Bucket: config.Bucket,
    FilePath: config.FilePath,
    Key: config.CosObjectName,
    Region: config.Region,
  });

  let scfInfo;

  try {
    logger.debug('检查云函数是否已存在');
    scfInfo = await scf(provider, {
      Action: 'GetFunction',
      FunctionName: config.FunctionName,
      Namespace: config.Namespace,
    });

    logger.info('更新云函数代码');
    await scf(provider, {
      Action: 'UpdateFunctionCode',
      CosBucketName: 'scf',
      CosBucketRegion: config.Region,
      CosObjectName: config.CosObjectName,
      FunctionName: config.FunctionName,
      Handler: config.Handler,
      Namespace: config.Namespace,
    });

    logger.info('更新云函数设置');
    await scf(provider, {
      Action: 'UpdateFunctionConfiguration',
      Environment: config.Environment,
      FunctionName: config.FunctionName,
      MemorySize: config.MemorySize,
      Timeout: config.Timeout,
      VpcConfig: config.VpcConfig,
      Namespace: config.Namespace,
    });
  } catch (error) {
    if (error.message.includes('ResourceNotFound.Function')) {
      logger.info('创建云函数');
      await scf(provider, {
        Action: 'CreateFunction',
        Code: {
          CosBucketName: 'scf',
          CosBucketRegion: config.Region,
          CosObjectName: config.CosObjectName,
        },
        Environment: config.Environment,
        FunctionName: config.FunctionName,
        Handler: config.Handler,
        Namespace: config.Namespace,
        MemorySize: config.MemorySize,
        Runtime: config.Runtime,
        Timeout: config.Timeout,
        VpcConfig: config.VpcConfig,
      });
    } else {
      throw error;
    }
  }

  logger.info('发布云函数版本');
  let res = await scf(provider, {
    Action: 'PublishVersion',
    Description: `Published by ${process.env.LOGNAME}`,
    FunctionName: config.FunctionName,
    Namespace: config.Namespace
  });
  config.FunctionVersion = res.FunctionVersion;

  try {
    logger.debug('检查云函数别名是否已存在 %s', config.Namespace);
    res = await scf(provider, {
      Action: 'GetAlias',
      Name: config.Namespace,
      FunctionName: config.FunctionName,
      Namespace: config.Namespace
    });

    await scf(provider, {
      Action: 'UpdateAlias',
      Name: config.Namespace,
      FunctionName: config.FunctionName,
      Namespace: config.Namespace,
      FunctionVersion: config.FunctionVersion,
    });
  } catch (error) {
    if (error.message.includes('ResourceNotFound.Alias')) {
      logger.info('发布云函数别名');
      await scf(provider, {
        Action: 'CreateAlias',
        Name: config.Namespace,
        FunctionName: config.FunctionName,
        FunctionVersion: config.FunctionVersion,
        Namespace: config.Namespace
      });
    } else {
      throw error;
    }
  }

  logger.info('云函数发布完成 %s/%s@%s', config.Namespace, config.FunctionName, config.FunctionVersion);

  if (config.triggers) {
    logger.info('检查并删除旧触发器');
    if (scfInfo && scfInfo.Triggers.length) {
      for (const trigger of scfInfo.Triggers) {
        await scf(provider, {
          Action: 'DeleteTrigger',
          FunctionName: config.FunctionName,
          Namespace: config.Namespace,
          TriggerName: trigger.TriggerName,
          Type: trigger.Type
        });
      }
    }
    const prevVersion = Number(config.FunctionVersion) - 1;
    if (prevVersion) {
      scfInfo = await scf(provider, {
        Action: 'GetFunction',
        FunctionName: config.FunctionName,
        Namespace: config.Namespace,
        Qualifier: prevVersion,
      });
      if (scfInfo.Triggers.length) {
        for (const trigger of scfInfo.Triggers) {
          await scf(provider, {
            Action: 'DeleteTrigger',
            FunctionName: config.FunctionName,
            Namespace: config.Namespace,
            Qualifier: prevVersion,
            TriggerName: trigger.TriggerName,
            Type: trigger.Type
          });
        }
      }
    }

    for (const trigger of config.triggers) {
      logger.info('发布触发器 %o', trigger);
      await scf(provider, {
        Action: 'CreateTrigger',
        FunctionName: config.FunctionName,
        TriggerName: trigger.name,
        Type: trigger.type,
        TriggerDesc: trigger.value,
        Qualifier: config.FunctionVersion,
        Namespace: config.Namespace,
        Enable: 'OPEN'
      });
    }

    logger.info('触发器发布完成 %o', config.triggers);
  }
}
