import test from 'ava';

import getPort from 'get-port';
import waitPort from 'wait-port';
import promiseRetry from 'p-retry';
import { Kafka } from 'kafkajs';

import { DockerCompose } from '.';

test('up, down, rm', async t => {
	t.timeout(120_000);

	const kafkaPort = await getPort();
	const kafkaUiPort = await getPort();

	const dockerCompose = new DockerCompose({
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
						`${kafkaUiPort}:8080`,
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

	await dockerCompose.up();

	await waitPort({
		port: kafkaPort,
		timeout: 60_000,
		output: 'silent',
	});

	const kafka = new Kafka({
		brokers: [
			`127.0.0.1:${kafkaPort}`,
		],
	});

	const kafkaAdmin = kafka.admin();

	await promiseRetry(async () => {
		await kafkaAdmin.connect();
	});

	await dockerCompose.down();
	await dockerCompose.rm();

	t.pass();
});
