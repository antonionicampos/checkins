import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, type ComponentProps } from 'react';
import { Pressable, type View } from 'react-native';
import { colors } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export const NAV_ICON_COLOR = colors.primary;

type Props = Omit<ComponentProps<typeof Pressable>, 'children'> & {
  icon: IconName;
  /** Lido pelo leitor de tela, já que o botão não tem texto. */
  label: string;
  color?: string;
  size?: number;
};

/** Botão de navegação só com ícone. Funciona dentro de `<Link asChild>`. */
export const IconButton = forwardRef<View, Props>(function IconButton(
  { icon, label, color = NAV_ICON_COLOR, size = 24, ...rest },
  ref,
) {
  return (
    <Pressable ref={ref} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} {...rest}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
});
