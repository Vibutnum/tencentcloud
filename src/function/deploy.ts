import Logger from '@faasjs/logger';
import cos from './cos';
import scf from './scf';

export default async function (logger: Logger, provider: any, config: any) {
  logger.info('开始部署云函数');

  logger.info('上传代码包');
  await cos(provider.secretId, provider.secretKey, {
    Bucket: config.Bucket,
    FilePath: config.FilePath,
    Key: config.CosObjectName,
    Region: config.Region,
  });

  logger.debug('检查云函数是否已存在');
  try {
    await scf(provider, {
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
      Action: 'Updateconfiguration',
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
        FunctionName: config.FunctionName,
        Namespace: config.Namespace,
        MemorySize: config.MemorySize,
        Timeout: config.Timeout,
        VpcConfig: config.VpcConfig,
      });
    } else {
      throw error;
    }
  }

  logger.info('发布云函数版本');
  const res = await scf(provider, {
    Action: 'PublishVersion',
    Description: `Published by ${process.env.LOGNAME}`,
    FunctionName: config.FunctionName,
    Namespace: config.Namespace
  });
  config.FunctionVersion = res.FunctionVersion;

  logger.info('发布完成 %s/%s@%s', config.Namespace, config.FunctionName, config.FunctionVersion);
}
