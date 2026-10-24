import { useCallback, useState } from 'react';
import { repo } from '../../src/data/repository';
import { useLiveQuery } from '../../src/data/useCloudQuery';
import { defaultSettings } from '../../src/domain/model';
let notify: (message: string) => void = () => {};
const initial = await repo.snapshot();
export function useApp() {
  const data = useLiveQuery(() => repo.snapshot(), [], initial);
  return {
    data,
    settings: defaultSettings,
    notify: useCallback((message: string) => notify(message), []),
    run: async (action: () => Promise<unknown>) => {
      try {
        await action();
        return true;
      } catch (error) {
        notify(String(error));
        return false;
      }
    },
  };
}
export const useModalError = () => null;
export function Notices() {
  const [message, setMessage] = useState('');
  notify = setMessage;
  return <p role="status">{message}</p>;
}
