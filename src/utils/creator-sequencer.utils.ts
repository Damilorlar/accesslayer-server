import { logger } from './logger.utils';

type QueuedOperation<T> = {
   execute: () => Promise<T>;
   resolve: (value: T) => void;
   reject: (reason: unknown) => void;
   enqueuedAt: number;
};

const QUEUE_TIMEOUT_MS = 10_000;
const IDLE_GC_MS = 5 * 60 * 1000;

class AsyncQueue {
   private queue: QueuedOperation<unknown>[] = [];
   private processing = false;

   async enqueue<T>(operation: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
         this.queue.push({
            execute: operation as () => Promise<unknown>,
            resolve: resolve as (value: unknown) => void,
            reject,
            enqueuedAt: Date.now(),
         });
         this.drain();
      });
   }

   get pending(): number {
      return this.queue.length;
   }

   private async drain(): Promise<void> {
      if (this.processing) return;
      this.processing = true;

      while (this.queue.length > 0) {
         const item = this.queue.shift()!;
         const waited = Date.now() - item.enqueuedAt;

         if (waited > QUEUE_TIMEOUT_MS) {
            item.reject(
               new SequencerTimeoutError(
                  `Operation waited ${waited}ms in queue, exceeding ${QUEUE_TIMEOUT_MS}ms limit`
               )
            );
            continue;
         }

         try {
            const result = await item.execute();
            item.resolve(result);
         } catch (err) {
            item.reject(err);
         }
      }

      this.processing = false;
   }
}

export class SequencerTimeoutError extends Error {
   public readonly code = 'sequencer_timeout';

   constructor(message: string) {
      super(message);
      this.name = 'SequencerTimeoutError';
   }
}

class CreatorSequencer {
   private queues = new Map<string, AsyncQueue>();
   private gcTimers = new Map<string, ReturnType<typeof setTimeout>>();

   async enqueue<T>(
      creatorWallet: string,
      operation: () => Promise<T>
   ): Promise<T> {
      this.resetGcTimer(creatorWallet);

      let queue = this.queues.get(creatorWallet);
      if (!queue) {
         queue = new AsyncQueue();
         this.queues.set(creatorWallet, queue);
         logger.debug(
            { creator_wallet: creatorWallet },
            'Creator sequencer queue created'
         );
      }

      return queue.enqueue(operation);
   }

   private resetGcTimer(creatorWallet: string): void {
      const existing = this.gcTimers.get(creatorWallet);
      if (existing) {
         clearTimeout(existing);
      }

      const timer = setTimeout(() => {
         const queue = this.queues.get(creatorWallet);
         if (queue && queue.pending === 0) {
            this.queues.delete(creatorWallet);
            this.gcTimers.delete(creatorWallet);
            logger.debug(
               { creator_wallet: creatorWallet },
               'Creator sequencer queue garbage collected after inactivity'
            );
         }
      }, IDLE_GC_MS);

      if (timer.unref) {
         timer.unref();
      }

      this.gcTimers.set(creatorWallet, timer);
   }

   get activeQueues(): number {
      return this.queues.size;
   }

   dispose(): void {
      for (const timer of this.gcTimers.values()) {
         clearTimeout(timer);
      }
      this.gcTimers.clear();
      this.queues.clear();
   }
}

export const creatorSequencer = new CreatorSequencer();

export { CreatorSequencer };
