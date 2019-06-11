import { loadTs } from '@faasjs/load';
import Logger from '@faasjs/logger';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

export default async function (logger: Logger, config: any, allConfig: any) {
  logger.info('开始构建代码包');
  logger.debug('%o', config);

  logger.debug('生成 index.js');
  await loadTs(config.filename, {
    output: {
      file: config.tmp + '/index.js',
      format: 'cjs',
      name: 'index',
      banner: `/**
 * @name ${config.name}
 * @author ${process.env.LOGNAME}
 * @build ${config.version}
 * @staging ${config.env}
 * @dependencies ${JSON.stringify(config.dependencies)}
 */`,
      footer: `
const main = module.exports;
main.config = ${JSON.stringify(allConfig, null, 2)};
module.exports = main.export();`
    }
  });

  logger.debug('生成 package.json');
  const packageJSON = {
    dependencies: config.dependencies,
    private: true
  };
  writeFileSync(config.tmp + '/package.json', JSON.stringify(packageJSON));
  logger.debug('%o', packageJSON);

  logger.debug('安装 npm 包');
  execSync('yarn --cwd ' + config.tmp + ' install --production');

  logger.debug('打包 zip 文件');
  execSync(`cd ${config.tmp} && zip -r deploy.zip *`);

  logger.info('构建完成 %sdeploy.zip', config.tmp);

  return config;
}
