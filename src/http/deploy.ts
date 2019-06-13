import { DeployData } from '@faasjs/func';
import api from './api';
import deepMerge from '@faasjs/deep_merge';
import Tencentcloud from '..';

const defaults = {
  authRequired: 'FALSE',
  enableCORS: 'TRUE',
  'requestConfig.method': 'POST',
  serviceType: 'SCF',
  serviceScfIsIntegratedResponse: 'TRUE',
  serviceTimeout: 30
};

export default async function (this: Tencentcloud, data: DeployData, origin: any) {
  this.logger.info('开始发布网关');

  const config = deepMerge(origin);

  // 参数名适配
  if (config.config.path) {
    config.config['requestConfig.path'] = config.config.path;
    delete config.config.path;
  } else {
    config.config['requestConfig.path'] = '/' + data.name!.replace(/_/g, '/');
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
    config.config.serviceScfFunctionName = data.name!.replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  // 合并配置项
  config.config = deepMerge(defaults, config.config, {
    apiName: data.name,
    serviceScfFunctionNamespace: data.env,
    serviceScfFunctionQualifier: data.env
  });

  const provider = config.provider.config;

  this.logger.debug('查询网关接口是否存在');

  const apiInfo = await api(provider, {
    Action: 'DescribeApisStatus',
    searchName: config.config['requestConfig.path'],
    serviceId: config.config.serviceId,
  }).then(function (body) {
    return body.apiIdStatusSet.filter(function (item: any) {
      return item.path === config.config['requestConfig.path'];
    })[0];
  });

  if (apiInfo) {
    this.logger.info('更新网关接口');
    await api(provider, Object.assign(config.config, {
      Action: 'ModifyApi',
      apiId: apiInfo.apiId,
    }));
  } else {
    this.logger.info('创建网关接口');
    await api(provider, Object.assign(config.config, {
      Action: 'CreateApi',
    }));
  }

  this.logger.info('发布网关');

  await api(provider, {
    Action: 'ReleaseService',
    environmentName: 'release',
    releaseDesc: `Published ${config.config.serviceScfFunctionName} by ${process.env.LOGNAME}`,
    serviceId: config.config.serviceId,
  });

  this.logger.info('发布完成 %s %s', config.config['requestConfig.method'], config.config['requestConfig.path']);
}
