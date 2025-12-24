import { useEffect, useState } from 'react';

interface TimerProps {
  duration: number;
  quizId: string;
  questionIndex: number;
  onComplete: () => void;
}

const TimerCircle = ({
  duration,
  quizId,
  questionIndex,
  onComplete,
}: TimerProps) => {
  const storageKey = `timer-${quizId}-${questionIndex}`;
  const startTimeKey = `start-time-${quizId}-${questionIndex}`;

  const [remaining, setRemaining] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Number(saved) : duration;
  });

  useEffect(() => {
    const startTime = localStorage.getItem(startTimeKey);
    const now = performance.now();

    if (!startTime) {
      localStorage.setItem(startTimeKey, String(now));
    } else {
      const elapsed = (now - Number(startTime)) / 1000;
      const newRemaining = Math.max(duration - elapsed, 0);
      setRemaining(newRemaining);

      if (newRemaining === 0) {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(startTimeKey);
        onComplete();
        return;
      }
    }

    const interval = setInterval(() => {
      const elapsed = (performance.now() - Number(localStorage.getItem(startTimeKey))) / 1000;
      const newRemaining = Math.max(duration - elapsed, 0);
      setRemaining(newRemaining);

      if (newRemaining === 0) {
        clearInterval(interval);
        localStorage.removeItem(storageKey);
        localStorage.removeItem(startTimeKey);
        onComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duration, onComplete, quizId, questionIndex]);

  return (
    <div className="text-2xl font-bold">
      ⏱ {Math.ceil(remaining)}s
    </div>
  );
};

export default TimerCircle;
