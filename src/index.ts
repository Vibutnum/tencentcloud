import { DeployData } from '@faasjs/func';
import configFunction from './function/config';
import buildFunction from './function/build';
import deployFunction from './function/deploy';
import deployHttp from './http/deploy';

export default class Tencentcloud {
  /**
   * 部署
   * @param type {string} 发布类型，支持 function
   * @param data {object} 部署环境配置
   * @param config {Logger} 部署对象配置
   */
  public async deploy (type: string, data: DeployData, config: any) {
    switch (type) {
      case 'function': {
        const processed = configFunction(data, config);
        await buildFunction(data.logger, processed.config, processed.pluginsConfig);
        await deployFunction(data.logger, processed.provider.config, processed.config);
        return processed;
      }
      case 'http': {
        await deployHttp(data, config);
        break;
      }
      default:
        throw Error(`Unknow deploy type: ${type}`);
    }
  }
}
