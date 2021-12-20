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

	async up({
		detach,
		scale = {},
	}: {
		detach?: boolean;
		scale?: Record<string, number>;
	} = {}): Promise<void> {
		const { childProcess } = await this._dockerCompose([
			'up',
			...this._getScaleArguments(scale),
			...(detach ? [ '--detach' ] : []),
		]);

		if (detach) {
			await childProcess;
		}
	}

	async rm({
		stop,
		force,
		volumes,
	}: {
		stop?: boolean;
		force?: boolean;
		volumes?: boolean;
	} = {}): Promise<void> {
		const { childProcess } = await this._dockerCompose([
			'rm',
			...(stop ? [ '--stop' ] : []),
			...(force ? [ '--force' ] : []),
			...(volumes ? [ '--volumes' ] : []),
		]);

		await childProcess;
	}

	async down(): Promise<void> {
		const { childProcess } = await this._dockerCompose([ 'down' ]);

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

	private _getScaleArguments(scale: Record<string, number>): string[] {
		const entries = Object.entries(scale);

		return entries.flatMap(entry => [
			'--scale',
			entry.join('='),
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

	private async _dockerCompose(args: string[], options?: execa.Options): Promise<DockerComposeResult> {
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
}
