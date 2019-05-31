import { DeployData } from '@faasjs/func';
import api from './api';
import deepMerge from '@faasjs/deep_merge';

const defaults = {
  authRequired: 'FALSE',
  enableCORS: 'TRUE',
  'requestConfig.method': 'POST',
  serviceType: 'SCF',
  serviceScfIsIntegratedResponse: 'TRUE',
  serviceTimeout: 30
};

export default async function (data: DeployData, origin: any) {
  data.logger.info('[TencentCloud] 开始发布网关');

  const config = deepMerge(origin);

  // 参数名适配
  if (config.config.path) {
    config.config['requestConfig.path'] = config.config.path;
    delete config.config.path;
  } else {
    config.config['requestConfig.path'] = data.name.replace(/_/g, '/');
  }
  if (config.config.method) {
    config.config['requestConfig.method'] = config.config.method;
    delete config.config.method;
  }
  if (config.config.timeout) {
    config.config.serviceTimeout = config.config.timeout;
    delete config.config.timeout;
  }
  if (config.config.functionName) {
    config.config.serviceScfFunctionName = config.config.functionName;
    delete config.config.functionName;
  } else {
    config.config.serviceScfFunctionName = data.name.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  // 合并配置项
  config.config = deepMerge(defaults, config.config, {
    apiName: data.name,
    serviceScfFunctionNamespace: data.env
  });

  data.logger.debug('查询网关接口是否存在');

  const apiInfo = await api(config.provider.config, {
    Action: 'DescribeApisStatus',
    searchName: config.config['requestConfig.path'],
    serviceId: config.config.serviceId,
  }).then(function (body) {
    return body.apiIdStatusSet.filter(function (item: any) {
      return item.path === config.config['requestConfig.path'];
    })[0];
  });

  if (apiInfo) {
    data.logger.info('更新网关接口');
    await api(config.provider.config, Object.assign(config.config, {
      Action: 'ModifyApi',
      apiId: apiInfo.apiId,
    }));
  } else {
    data.logger.info('创建网关接口');
    await api(config.provider.config, Object.assign(config.config, {
      Action: 'CreateApi',
    }));
  }

  data.logger.info('发布网关');

  await api(config.provider.config, {
    Action: 'ReleaseService',
    environmentName: 'release',
    releaseDesc: `Published ${config.config.serviceScfFunctionName} by ${process.env.LOGNAME}`,
    serviceId: config.config.serviceId,
  });

  data.logger.info('发布完成 %s %s', config.config['requestConfig.method'], config.config['requestConfig.path']);
}
