import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let audioConfigured = false;
let tapPlayer: ReturnType<typeof createAudioPlayer> | null = null;

async function ensureAudioFeedbackReady() {
  if (!audioConfigured) {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    });
    audioConfigured = true;
  }

  if (!tapPlayer) {
    tapPlayer = createAudioPlayer(require('../../assets/sounds/tap.wav'));
  }
}

async function playTapSound() {
  try {
    await ensureAudioFeedbackReady();
    if (!tapPlayer) {
      return;
    }

    await tapPlayer.seekTo(0);
    tapPlayer.play();
  } catch {
    // Sound should never block the main user action.
  }
}

export async function triggerLightHaptic() {
  await Promise.allSettled([
    Haptics.selectionAsync(),
    playTapSound(),
  ]);
}

export async function triggerSuccessHaptic() {
  await Promise.allSettled([
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    playTapSound(),
  ]);
}
