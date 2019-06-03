// eslint-disable-next-line @typescript-eslint/no-var-requires
const cosSdk = require('cos-nodejs-sdk-v5');

export default function cosUploadFile (provider: any, params: any) {
  const client = new cosSdk({
    SecretId: provider.secretId,
    SecretKey: provider.secretKey,
  });

  return new Promise((resolve, reject) => {
    client.sliceUploadFile(params, function (err: any, data: any) {
      if (err) {
        console.error(err);
        reject(err);
      }
      resolve(data);
    });
  });
}
