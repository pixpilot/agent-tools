import type { VolumeMount } from '../types';
import { HOME_CACHE_VOLUME, PRUNABLE_VOLUME_LABEL, SANDBOX_LABEL } from '../constants';
import { runCapture, runOrThrow } from '../utils/run-command';

/** Labels newly created volumes; existing volumes are never adopted or relabeled. */
export function ensureSessionVolumes(volumes: VolumeMount[]): void {
  volumes.forEach((volume) => {
    if (runCapture('docker', ['volume', 'inspect', volume.name]).status === 0) {
      return;
    }
    const args = ['volume', 'create', '--label', `${SANDBOX_LABEL}=1`];
    if (
      volume.name === HOME_CACHE_VOLUME ||
      /^coding-agent-sandbox-deps-[a-f0-9]{10}-[a-f0-9]{6}$/u.test(volume.name)
    ) {
      args.push('--label', `${PRUNABLE_VOLUME_LABEL}=1`);
    }
    runOrThrow('docker', [...args, volume.name]);
  });
}
