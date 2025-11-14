/**
 * Kafka Producer Module
 * 
 * Manages Kafka producer connection and message publishing.
 * Uses KafkaJS library which is compatible with Kafka and Redpanda brokers.
 */

import { Kafka, logLevel } from 'kafkajs';
import { cfg } from '../core/config.js';
import { logger } from '../core/logger.js';

/**
 * Kafka client instance
 * 
 * Configured with client ID and broker addresses from config.
 * Log level set to ERROR to reduce noise from KafkaJS internal logs.
 */
const kafka = new Kafka({
  clientId: cfg.kafka.clientId,
  brokers: cfg.kafka.brokers,
  logLevel: logLevel.ERROR
});

/**
 * Kafka producer instance
 * 
 * Used to publish game update messages to the configured topic.
 */
export const producer = kafka.producer();

/**
 * Connects the Kafka producer to the broker(s)
 * 
 * Must be called before publishing any messages.
 */
export async function startProducer() {
  logger.info({ brokers: cfg.kafka.brokers }, 'Connecting to Kafka brokers...');
  await producer.connect();
  logger.info({ brokers: cfg.kafka.brokers }, 'Kafka producer connected');
}

/**
 * Disconnects the Kafka producer gracefully
 * 
 * Should be called during shutdown to ensure all pending messages are sent.
 */
export async function stopProducer() {
  await producer.disconnect();
}

/**
 * Publishes a game update message to Kafka
 * 
 * @param key - Message key (typically `${type}:${gameId}` for partitioning)
 * @param value - Message payload object (will be JSON stringified)
 */
export async function publishUpdate(key: string, value: object) {
  const payload = {
    topic: cfg.kafka.topicUpdates,
    messages: [{ key, value: JSON.stringify(value) }]
  };
  await producer.send(payload);
}
