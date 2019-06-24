import scf from './scf';
import Tencentcloud from '..';

export default function invokeCloudFunction (this: Tencentcloud, name: string, data: any, options?: any) {
  this.logger.debug('invokeFunction: %s %o', name, options);

  return scf.call(this, Object.assign({
    Action: 'Invoke',
    FunctionName: name.replace(/[^a-zA-Z0-9-_]/g, '_'),
    ClientContext: JSON.stringify(data),
    InvocationType: 'Event',
    Namespace: process.env.FaasEnv,
    Qualifier: process.env.FaasEnv
  }, options || {}));
}
