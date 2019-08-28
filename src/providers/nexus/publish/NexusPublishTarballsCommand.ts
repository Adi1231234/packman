import Command, { CommandExecuteOptions } from '../../../core/Command';
import { globalOptions, registryOption } from '../../../core/commandOptions';
import { LoggerOptions } from '../../../core/logger';
import NexusApiPublisher from './NexusApiPublisher';

export type NexusPublishTarballsCommandOptions = CommandExecuteOptions & LoggerOptions & {
  packagesPath: string
  registry: string
  distTag: boolean
}

export default class NexusPublishTarballsCommand implements Command {
  get definition() {
    return {
      name: 'tarballs',
      flags: '<packagesPath>',
      description: 'use the nexus api to publish tarballs at the specified path to the registry',
      options: [
        registryOption,
        ...globalOptions,
      ],
    };
  }

  async execute(options: NexusPublishTarballsCommandOptions) {
    // const { packagesPath, registry, distTag } = options;
    const publisher = new NexusApiPublisher(options);
    publisher.publish();
  }
}
