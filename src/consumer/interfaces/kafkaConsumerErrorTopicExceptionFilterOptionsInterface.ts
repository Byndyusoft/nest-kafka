/*
 * Copyright 2022 Byndyusoft
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface IKafkaConsumerErrorTopicExceptionFilterOptions {
  readonly connectionName?: string;

  readonly retryTopicPicker?: ((...args: any[]) => string) | false;

  readonly errorTopicPicker?: ((...args: any[]) => string) | false;

  /**
   * @deprecated Use errorTopicPicker instead
   */
  readonly topicPicker?: ((...args: any[]) => string) | false;

  /**
   * @default "original"
   */
  readonly resendHeadersPrefix?: string;
}