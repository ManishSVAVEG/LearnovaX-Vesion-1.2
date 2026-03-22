import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { useBubbleSound } from '@/lib/sounds';

interface BubblePressableProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
}

export const BubblePressable: React.FC<BubblePressableProps> = ({ 
  children, 
  onPress, 
  style, 
  ...props 
}) => {
  const playSound = useBubbleSound();

  const handlePress = (event: any) => {
    playSound(); // Bubble sound bajao
    if (onPress) {
      onPress(event); // Purana click function chalao
    }
  };

  return (
    <Pressable 
      {...props} 
      onPress={handlePress} 
      style={style}
    >
      {children}
    </Pressable>
  );
};
