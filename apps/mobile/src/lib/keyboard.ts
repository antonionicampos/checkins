import { useEffect, useState, type RefObject } from 'react';
import { Keyboard, Platform, type View } from 'react-native';

/**
 * Quanto o teclado cobre da parte de baixo de `ref`, em pixels.
 * O KeyboardAvoidingView não basta no Android com tela de ponta a ponta (padrão do Expo SDK 57):
 * a janela não encolhe e a caixa de texto ficava atrás do teclado. Aqui medimos a sobreposição real,
 * o que funciona tanto quando a janela encolhe quanto quando não encolhe.
 */
export function useKeyboardOverlap(ref: RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      ref.current?.measureInWindow((_x, y, _w, height) => {
        setOverlap(Math.max(0, y + height - e.endCoordinates.screenY));
      });
    });
    const hide = Keyboard.addListener(hideEvent, () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);

  return overlap;
}
