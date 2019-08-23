const { existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const { URL } = require('url');
const fs = require('fs');
const tar = require('tar');
const semver = require('semver');

const { retrieveFile } = require('../../core/uri-retriever');

require('colors');

const downloadFileAsync = require('../../core/download-file');

function downloadFromPackageLock(packageLock, directory, options) {
  const tarballs = [];
  _enumerateDependencies(tarballs, packageLock.dependencies);

  return _downloadTarballs(tarballs, directory, options);
}

/**
 * @param { Iterable<string> | ArrayLike<string> } tarballsIterable
 * @param { string } directory 
 */
function downloadFromIterable(tarballsIterable, directory, options) {
  const tarballs = Array.from(tarballsIterable)
    .map(url => ({ url, directory: _convertUrlToDirectory(url) }));
  return _downloadTarballs(tarballs, directory, options);
}

function _enumerateDependencies(tarballs, dependencies) {
  for (const [dependencyName, dependency] of Object.entries(dependencies)) {
    if (dependency.resolved) {
      tarballs.push({ url: dependency.resolved, directory: dependencyName });
    }
    if (dependency.dependencies) {
      _enumerateDependencies(tarballs, dependency.dependencies);
    }
  }
}

function _downloadTarballs(tarballs, baseDirectory = './tarballs', { force, logger }) {
  if (!existsSync(baseDirectory)) {
    mkdirSync(baseDirectory);
  }

  logger.info('downloading tarballs'.green, { count: tarballs.length });
  const promises = tarballs.map(async ({ url, directory }, i, arr) => {
    const position = `${i + 1}/${arr.length}`;
    logger.info('downloading'.cyan, position, url);

    const tarballUrl = await getTarballUrl(url, directory, logger);

    if (tarballUrl) {
      return _downloadFileWithRetry(tarballUrl, position, 10, {
        directory: join(baseDirectory, directory),
        force,
        logger,
      });
    }
  });
  return Promise.all(promises);
}

async function getTarballUrl(tarballUrl, directory, logger) {
  logger.debug('get tarball url', tarballUrl, directory);

  const url = new URL(tarballUrl);

  if (url.pathname.endsWith('.tgz')) {
    logger.debug('tarball ends with tgz, returning as is', tarballUrl);
    return tarballUrl;
  }

  const pathParts = url.pathname.split('/');
  const packageVersion = pathParts.pop();

  const packagePath = pathParts.join('/');
  const packageUrl = new URL(packagePath, url.origin);
  logger.debug('fetching package manifest from', packageUrl.href.yellow, 'for version', packageVersion);
  const packageManifest = await retrieveFile(packageUrl, { json: true, logger });

  if (!packageManifest) {
    logger.info(`Could not retrieve package manifest from '${tarballUrl}'`.yellow);
    return;
  }

  const versionManifest = packageManifest.versions[packageVersion];
  logger.debug('version manifest', { packageUrl, packageVersion, versionManifest });

  if (!versionManifest) {
    logger.info(`The package '${packageManifest.name}' doesn't seem to have the requested version '${packageVersion}`.yellow);
    return;
  }

  const { dist } = versionManifest;
  logger.debug('dist and tarball properties', dist, dist ? dist.tarball : '<dist is undefined>');
  return dist.tarball;
}

async function _downloadFileWithRetry(url, position, count, options = {}) {
  const { directory, logger } = options;
  try {
    const { path, duration } = await downloadFileAsync(url, options);
    if (!existsSync(path)) {
      throw new Error(`tgz does not exist ${path}`);
    }
    if (_validateTarball(path, logger)) {
      logger.info('downloaded tgz'.green, position, url, `${duration}ms`.gray);
      return { path, url, position, duration };
    }
    else throw new Error('Error downloading tgz, retrying... ');
  } catch (error) {
    const errorMessage = error ? error.message || error : '<no error message>';
    logger.info('failed to download tgz'.red, String(errorMessage).magenta, url, count);
    logger.error(error);
    if (count > 0) {
      return _downloadFileWithRetry(url, position, count - 1, options);
    }
  }
}

function _validateTarball(path, logger) {
  try {
    tar.list({ f: path, sync: true });
    return true;
  } catch (error) {
    logger.info('download error'.red, 'deleting tgz'.yellow, path);
    logger.error(error);
    fs.unlinkSync(path);
    return false;
  }
}

function _convertUrlToDirectory(url) {
  const realUrl = new URL(url);
  const normalizedPath = realUrl
    .pathname.split('/-/')[0]
    .substring(1)
    .replace('%2f', '/');

  const pathParts = normalizedPath.split('/');

  const validVersion = semver.valid(pathParts[pathParts.length - 1]);
  const directoryParts = validVersion ? pathParts.slice(0, -1) : pathParts;
  return directoryParts.join('/');
}

module.exports = {
  downloadFromPackageLock,
  downloadFromIterable,
  getTarballUrl,
};