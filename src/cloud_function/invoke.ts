import request from '@faasjs/request';
import scf from './scf';
import Tencentcloud from '..';

export default function invokeCloudFunction (this: Tencentcloud, name: string, data: any, options?: any) {
  this.logger.debug('invokeFunction: %s %o', name, options);

  if (process.env.FaasMode === 'local' && process.env.FaasLocal) {
    return request(process.env.FaasLocal + '/' + name, {
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
  } else {
    return scf.call(this, Object.assign({
      Action: 'Invoke',
      FunctionName: name.replace(/[^a-zA-Z0-9-_]/g, '_'),
      ClientContext: JSON.stringify(data),
      InvocationType: 'Event',
      Namespace: process.env.FaasEnv,
      Qualifier: process.env.FaasEnv
    }, options || {}));
  }
}
