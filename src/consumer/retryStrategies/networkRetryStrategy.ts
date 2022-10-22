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

export class NetworkRetryStrategy {
  // See https://github.com/FGRibreau/node-request-retry/blob/master/strategies/NetworkError.js
  private static readonly retriableCodes = new Set([
    "ECONNRESET",
    "ENOTFOUND",
    "ESOCKETTIMEDOUT",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "EPIPE",
    "EAI_AGAIN",
    "EBUSY",
  ]);

  public static isRetriable(error: unknown): boolean {
    if (!error) {
      return false;
    }

    return NetworkRetryStrategy.retriableCodes.has(
      (error as { code: string }).code,
    );
  }
}
