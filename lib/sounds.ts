import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';

// Relative path uses "../" for better compatibility with Expo Metro.
const BUBBLE_SOUND_PATH = require('../assets/sounds/bubble.mp3');

export const useBubbleSound = () => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  async function loadSound() {
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(BUBBLE_SOUND_PATH);
      setSound(newSound);
    } catch (error) {
      // Sound file nahi mili ya load nahi ho rahi toh abhi hum app ko crash nahi hone denge.
      console.warn('Bubble sound load nahi hua. assets/sounds/bubble.mp3 check karein:', error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    loadSound();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const playBubbleSound = async () => {
    try {
      // Haptics hamesha chalenge (vibration)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Sound play tabhi hoga agar load hua hai
      if (sound) {
        await sound.replayAsync();
      }
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  return playBubbleSound;
};
