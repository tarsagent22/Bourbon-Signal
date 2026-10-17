import { SignalMotionBackdrop } from '../components/SignalMotionBackdrop';

export function OnboardingBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  return <SignalMotionBackdrop reduceMotion={reduceMotion} />;
}
