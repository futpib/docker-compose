import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import debug from 'debug';
import type { ExecaChildProcess } from 'execa';
import execa from 'execa';
import tempy from 'tempy';
import YAML from 'js-yaml';
import type { Compose } from 'compose-spec-schema';

const log = debug('docker-compose');

const {
	DOCKER_COMPOSE_STDIO = 'inherit',
} = process.env;

function isProcessStdio(x: unknown): x is 'inherit' | 'pipe' | 'ignore' {
	return (
		x === 'inherit'
			|| x === 'pipe'
			|| x === 'ignore'
	);
}

export interface DockerComposeOptions {
	file: Compose | string | Array<Compose | string>;
	directory?: string;
	projectName?: string;
}

export interface DockerComposeResult {
	childProcess: ExecaChildProcess;
}

export class DockerCompose {
	private readonly _file: DockerComposeOptions['file'];

	private readonly _directory: string;

	private readonly _projectName?: string;

	constructor({
		file,
		directory,
		projectName,
	}: DockerComposeOptions) {
		this._file = file;

		this._directory = directory ?? tempy.directory({
			prefix: 'docker-compose',
		});

		this._projectName = projectName;
	}

	/**
	 * Run a custom docker-compose command.
	 * Prefer using the other methods if possible.
	 */
	async command(args: string[], options?: execa.Options): Promise<DockerComposeResult> {
		const childProcess = this._execa('docker-compose', [
			...(await this._getGlobalArguments()),
			...args,
		], {
			stdio: isProcessStdio(DOCKER_COMPOSE_STDIO) ? DOCKER_COMPOSE_STDIO : 'inherit',
			...options,
		});

		return {
			childProcess,
		};
	}

	/**
	 * Create and start containers.
	 */
	async up(
		{
			abortOnContainerExit,
			alwaysRecreateDeps,
			attach = [],
			attachDependencies,
			build,
			detach = true,
			exitCodeFrom,
			forceRecreate,
			noAttach = [],
			noBuild,
			noDeps,
			noLogPrefix,
			noRecreate,
			noStart,
			pull,
			quietPull,
			removeOrphans,
			renewAnonVolumes,
			scale = {},
			timeout,
			timestamps,
			wait,
		}: {
			/**
			 * Stops all containers if any container was stopped. Incompatible with `detach`.
			 */
			abortOnContainerExit?: boolean;
			/**
			 * Recreate dependent containers. Incompatible with `noRecreate`.
			 */
			alwaysRecreateDeps?: boolean;
			/**
			 * Attach to service output.
			 */
			attach?: string[];
			/**
			 * Attach to dependent containers.
			 */
			attachDependencies?: boolean;
			/**
			 * Build images before starting containers.
			 */
			build?: boolean;
			/**
			 * Detached mode: Run containers in the background.
			 */
			detach?: boolean;
			/**
			 * Return the exit code of the selected service container. Implies `abortOnContainerExit`.
			 */
			exitCodeFrom?: string;
			/**
			 * Recreate containers even if their configuration and image haven't changed.
			 */
			forceRecreate?: boolean;
			/**
			 * Don't attach to specified service.
			 */
			noAttach?: string[];
			/**
			 * Don't build an image, even if it's missing.
			 */
			noBuild?: boolean;
			/**
			 * Don't start linked services.
			 */
			noDeps?: boolean;
			/**
			 * Don't print prefix in logs.
			 */
			noLogPrefix?: boolean;
			/**
			 * If containers already exist, don't recreate them. Incompatible with `forceRecreate`.
			 */
			noRecreate?: boolean;
			/**
			 * Don't start the services after creating them.
			 */
			noStart?: boolean;
			/**
			 * Pull image before running (default "missing").
			 */
			pull?: 'always' | 'missing' | 'never';
			/**
			 * Pull without printing progress information.
			 */
			quietPull?: boolean;
			/**
			 * Remove containers for services not defined in the Compose file.
			 */
			removeOrphans?: boolean;
			/**
			 * Recreate anonymous volumes instead of retrieving data from the previous containers.
			 */
			renewAnonVolumes?: boolean;
			/**
			 * Scale SERVICE to NUM instances. Overrides the scale setting in the Compose file if present.
			 */
			scale?: Record<string, number>;
			/**
			 * Use this timeout in seconds for container shutdown when attached or when containers are already running. (default 10).
			 */
			timeout?: number;
			/**
			 * Show timestamps.
			 */
			timestamps?: boolean;
			/**
			 * Wait for services to be running|healthy. Implies detached mode.
			 */
			wait?: boolean;
		} = {},
		execaOptions?: execa.Options,
	): Promise<DockerComposeResult> {
		const { childProcess } = await this.command([
			'up',

			...(abortOnContainerExit ? [ '--abort-on-container-exit' ] : []),
			...(alwaysRecreateDeps ? [ '--always-recreate-deps' ] : []),
			...attach.map(service => `--attach=${service}`),
			...(attachDependencies ? [ '--attach-dependencies' ] : []),
			...(build ? [ '--build' ] : []),
			...(detach ? [ '--detach' ] : []),
			...(exitCodeFrom ? [ `--exit-code-from=${exitCodeFrom}` ] : []),
			...(forceRecreate ? [ '--force-recreate' ] : []),
			...noAttach.map(service => `--no-attach=${service}`),
			...(noBuild ? [ '--no-build' ] : []),
			...(noDeps ? [ '--no-deps' ] : []),
			...(noLogPrefix ? [ '--no-log-prefix' ] : []),
			...(noRecreate ? [ '--no-recreate' ] : []),
			...(noStart ? [ '--no-start' ] : []),
			...(pull ? [ `--pull=${pull}` ] : []),
			...(quietPull ? [ '--quiet-pull' ] : []),
			...(removeOrphans ? [ '--remove-orphans' ] : []),
			...(renewAnonVolumes ? [ '--renew-anon-volumes' ] : []),
			...this._joinArgumentsRecord('--scale', '=', scale),
			...(timeout ? [ `--timeout=${timeout}` ] : []),
			...(timestamps ? [ '--timestamps' ] : []),
			...(wait ? [ '--wait' ] : []),
		], execaOptions);

		if (detach) {
			await childProcess;
		}

		return { childProcess };
	}

	/**
	 * Run a one-off command on a service.
	 */
	async run(
		service: string,
		command: undefined | string,
		args: string[],
		{
			build,
			detach = true,
			entrypoint,
			env = {},
			interactive,
			label = {},
			name,
			noTTY,
			noDeps,
			publish = {},
			quietPull,
			removeOrphans,
			rm,
			servicePorts,
			useAliases,
			user,
			volume = {},
			workdir,
		}: {
			/**
			 * Build image before starting container.
			 */
			build?: boolean;
			/**
			 * Run container in background and print container ID
			 */
			detach?: boolean;
			/**
			 * Override the entrypoint of the image
			 */
			entrypoint?: string;
			/**
			 * Set environment variables
			 */
			env?: Record<string, string>;
			/**
			 * Keep STDIN open even if not attached. (default true)
			 */
			interactive?: boolean;
			/**
			 * Add or override a label
			 */
			label?: Record<string, string>;
			/**
			 * Assign a name to the container
			 */
			name?: string;
			/**
			 * Disable pseudo-TTY allocation (default: auto-detected).
			 */
			noTTY?: boolean;
			/**
			 * Don't start linked services.
			 */
			noDeps?: boolean;
			/**
			 * Publish a container's port(s) to the host.
			 */
			publish?: Record<string, string>;
			/**
			 * Pull without printing progress information.
			 */
			quietPull?: boolean;
			/**
			 * Remove containers for services not defined in the Compose file.
			 */
			removeOrphans?: boolean;
			/**
			 * Automatically remove the container when it exits
			 */
			rm?: boolean;
			/**
			 * Run command with the service's ports enabled and mapped to the host.
			 */
			servicePorts?: boolean;
			/**
			 * Use the service's network useAliases in the network(s) the container connects to.
			 */
			useAliases?: boolean;
			/**
			 * Run as specified username or uid
			 */
			user?: string;
			/**
			 * Bind mount a volume.
			 */
			volume?: Record<string, string>;
			/**
			 * Working directory inside the container
			 */
			workdir?: string;
		} = {},
		execaOptions?: execa.Options,
	): Promise<void> {
		const { childProcess } = await this.command([
			'run',

			...(build ? [ '--build' ] : []),
			...(detach ? [ '--detach' ] : []),
			...(entrypoint ? [ '--entrypoint', entrypoint ] : []),
			...this._joinArgumentsRecord('--env', '=', env),
			...(interactive ? [ '--interactive' ] : []),
			...this._joinArgumentsRecord('--label', '=', label),
			...(name ? [ '--name', name ] : []),
			...(noTTY ? [ '--no-TTY' ] : []),
			...(noDeps ? [ '--no-deps' ] : []),
			...this._joinArgumentsRecord('--publish', ':', publish),
			...(quietPull ? [ '--quiet-pull' ] : []),
			...(removeOrphans ? [ '--remove-orphans' ] : []),
			...(rm ? [ '--rm' ] : []),
			...(servicePorts ? [ '--service-ports' ] : []),
			...(useAliases ? [ '--use-aliases' ] : []),
			...(user ? [ '--user', user ] : []),
			...this._joinArgumentsRecord('--volume', ':', volume),
			...(workdir ? [ '--workdir', workdir ] : []),

			service,
			...(command ? [ command ] : []),
			...args,
		], execaOptions);

		await childProcess;
	}

	/**
	 * Removes stopped service containers.
	 */
	async rm(
		{
			stop,
			force,
			volumes,
		}: {
			/**
			 * Stop the containers, if required, before removing.
			 */
			stop?: boolean;
			/**
			 * Don't ask to confirm removal
			 */
			force?: boolean;
			/**
			 * Remove any anonymous volumes attached to containers
			 */
			volumes?: boolean;
		} = {},
		execaOptions?: execa.Options,
	): Promise<void> {
		const { childProcess } = await this.command([
			'rm',

			...(stop ? [ '--stop' ] : []),
			...(force ? [ '--force' ] : []),
			...(volumes ? [ '--volumes' ] : []),
		], execaOptions);

		await childProcess;
	}

	/**
	 * Stop and remove containers, networks.
	 */
	async down(
		{
			removeOrphans,
			rmi,
			timeout,
			volumes,
		}: {
			/**
			 * Remove containers for services not defined in the Compose file.
			 */
			removeOrphans?: boolean;
			/**
			 * Remove images used by services. "local" remove only images that don't have a custom tag.
			 */
			rmi?: 'local' | 'all';
			/**
			 * Specify a shutdown timeout in seconds (default 10)
			 */
			timeout?: number;
			/**
			 * Remove named volumes declared in the volumes section of the Compose file and anonymous volumes attached to containers.
			 */
			volumes?: string;
		} = {},
		options?: execa.Options,
	): Promise<void> {
		const { childProcess } = await this.command([
			'down',

			...(removeOrphans ? [ '--remove-orphans' ] : []),
			...(rmi ? [ '--rmi', rmi ] : []),
			...(timeout ? [ '--timeout', timeout.toString() ] : []),
			...(volumes ? [ '--volumes', volumes ] : []),
		], options);

		await childProcess;
	}

	private async _getFile(file: string | Compose, index: number): Promise<string> {
		if (typeof file === 'string') {
			return file;
		}

		const temporaryYamlFilePath = path.join(this._directory, `docker-compose.${index}.yml`);

		const yamlString = YAML.dump(file);

		await fs.writeFile(temporaryYamlFilePath, yamlString);

		return temporaryYamlFilePath;
	}

	private async _getFiles(): Promise<string[]> {
		const files: Array<Compose | string> = Array.isArray(this._file) ? this._file : [ this._file ];

		return Promise.all(files.map(async (file, index) => this._getFile(file, index)));
	}

	private async _getFilesArguments(): Promise<string[]> {
		const files = await this._getFiles();

		return files.flatMap(file => [ '--file', file ]);
	}

	private async _getGlobalArguments(): Promise<string[]> {
		return [
			...(this._projectName ? [ '--project-name', this._projectName ] : []),
			...(await this._getFilesArguments()),
		];
	}

	private _joinArgumentsRecord(option: string, separator: '=' | ':', scale: Record<string, number | string>): string[] {
		const entries = Object.entries(scale);

		return entries.flatMap(entry => [
			option,
			entry.join(separator),
		]);
	}

	private _execa(
		file: string,
		args: readonly string[],
		options?: execa.Options,
	): ExecaChildProcess {
		log('execa', file, args);
		return execa(file, args, options);
	}
}
