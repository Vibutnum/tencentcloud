import deepMerge from '@faasjs/deep_merge';
import { DeployData } from '@faasjs/func';

const defaults = {
  Handler: 'index.handler',
  MemorySize: 128,
  Timeout: 30,
  Runtime: 'Nodejs8.9'
};

export default function (data: DeployData, origin: any) {
  const config = deepMerge(origin);
  config.logger = data.logger;

  // 参数名适配
  if (config.config.name) {
    config.config.FunctionName = config.config.name;
    delete config.config.name;
  } else {
    config.config.FunctionName = data.name.replace(/[^a-zA-Z0-9-_]/g, '_');
  }
  if (config.config.memorySize) {
    config.config.MemorySize = config.config.memorySize;
    delete config.config.memorySize;
  }
  if (config.config.timeout) {
    config.config.Timeout = config.config.timeout;
    delete config.config.timeout;
  }

  // 合并配置项
  config.config = deepMerge(defaults, config.config, {
    // 基本参数
    Region: config.provider.config.region,
    Namespace: data.env,

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

  return config;
}
