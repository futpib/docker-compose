# docker-compose

> Start `docker-compose.yml` from TypeScript (inline & typed or from a yaml file)

[![npm](https://shields.io/npm/v/@futpib/docker-compose)](https://www.npmjs.com/package/@futpib/docker-compose) [![Coverage Status](https://coveralls.io/repos/github/futpib/docker-compose/badge.svg?branch=master)](https://coveralls.io/github/futpib/docker-compose?branch=master)

## Usage

```typescript
import getPort from 'get-port';
import waitPort from 'wait-port';
import { DockerCompose } from '@futpib/docker-compose';

const { TEST_ENABLE_KAFKA_UI } = process.env;

const kafkaPort = await getPort();

const dockerCompose = new DockerCompose({
	projectName: 'my-kafka-test',

	/**
	 * Below is an inline docker-compose config. It is checked by TypeScript.
	 * Could've used a yaml string like this:
	 * @example
	 * file: await fs.readFile('path/to/my/docker-compose.yml')
	 */
	file: {
		version: '3.9',
		services: {
			zookeeper: {
				image: 'confluentinc/cp-zookeeper:7.0.0',
				environment: {
					ZOOKEEPER_CLIENT_PORT: '2181',
				},
			},

			kafka: {
				image: 'confluentinc/cp-kafka:7.0.0',
				depends_on: [
					'zookeeper',
				],
				environment: {
					KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181',
					KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT',
					KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:${kafkaPort}`,
					KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
					KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
					KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
					KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
				},
				ports: [
					`${kafkaPort}:${kafkaPort}`,
				],
			},

			'kafka-ui': {
				image: 'provectuslabs/kafka-ui:0.2.1',
				depends_on: [
					'kafka',
					'zookeeper',
				],
				ports: [
					'8080:8080',
				],
				environment: {
					KAFKA_CLUSTERS_0_NAME: 'local',
					KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: 'kafka:9092',
					KAFKA_CLUSTERS_0_ZOOKEEPER: 'zookeeper:2181',
				},
			},
		},
	},
});

// Bring services up, enable `kafka-ui` only if environment variable says so
await dockerCompose.up({
	scale: {
		'kafka-ui': TEST_ENABLE_KAFKA_UI === 'true' ? 1 : 0,
	},
});

// Wait for kafka to boot up
await waitPort({
	port: kafkaPort,
	timeout: 60_000,
	output: 'silent',
});

// Test something on a running kafka...

// Clean up (or call `down` instead of `rm` if you'd like to keep created containers)
await dockerCompose.rm({
	stop: true,
	force: true,
});
```
