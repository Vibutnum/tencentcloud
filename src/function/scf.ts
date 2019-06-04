import request from '@faasjs/request';
import * as crypto from 'crypto';

function mergeData (data: any, prefix: string = '') {
  const ret: any = {};
  for (const k in data) {
    if (typeof data[k as string] === 'undefined' || data[k as string] === null) {
      continue;
    }
    if (data[k as string] instanceof Array || data[k as string] instanceof Object) {
      Object.assign(ret, mergeData(data[k as string], prefix + k + '.'));
    } else {
      ret[prefix + k] = data[k as string];
    }
  }
  return ret;
}

function formatSignString (params: any) {
  const str: string[] = [];

  for (const key of Object.keys(params).sort()) {
    str.push(key + '=' + params[key as string]);
  }

  return str.join('&');
}

/**
 * 发出请求
 *
 * @param config {object} 服务商基本参数
 * @param config.region {string} 区域
 * @param config.secretId {string} secretId
 * @param config.secretKey {string} secretKey
 * @param params {object} 请求参数
 */
export default function action (config: any, params: any) {
  params = Object.assign({
    Nonce: Math.round(Math.random() * 65535),
    Region: config.region,
    SecretId: config.secretId,
    SignatureMethod: 'HmacSHA256',
    Timestamp: Math.round(Date.now() / 1000) - 1,
    Version: '2018-04-16',
  }, params);
  params = mergeData(params);

  const sign = 'POSTscf.tencentcloudapi.com/?' + formatSignString(params);

  params.Signature = crypto.createHmac('sha256', config.secretKey).update(sign).digest('base64');

  return request('https://scf.tencentcloudapi.com/?', {
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  }).then(function (res) {
    const body = JSON.parse(res.body);
    if (body.Response.Error) {
      throw Error(JSON.stringify(body.Response.Error));
    } else {
      return body.Response;
    }
  });
}
