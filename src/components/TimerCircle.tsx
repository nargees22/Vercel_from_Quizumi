import { useEffect, useRef, useState } from 'react';

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Number(saved) : duration;
  });

  // Start or resume the timer
  useEffect(() => {
    const startTimer = () => {
      startTimeRef.current = performance.now();
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          const elapsed = Math.floor((performance.now() - (startTimeRef.current || 0)) / 1000);
          const next = duration - elapsed;
          localStorage.setItem(storageKey, String(next));

          if (next <= 0) {
            clearInterval(intervalRef.current!);
            localStorage.removeItem(storageKey);
            onComplete();
            return 0;
          }
          return next;
        });
      }, 1000);
    };

    startTimer();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [questionIndex]);

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        const saved = localStorage.getItem(storageKey);
        const elapsed = Math.floor((performance.now() - (startTimeRef.current || 0)) / 1000);
        const next = (saved ? Number(saved) : duration) - elapsed;
        setRemaining(next);
        startTimeRef.current = performance.now();
        intervalRef.current = setInterval(() => {
          setRemaining(prev => {
            const elapsed = Math.floor((performance.now() - (startTimeRef.current || 0)) / 1000);
            const next = duration - elapsed;
            localStorage.setItem(storageKey, String(next));

            if (next <= 0) {
              clearInterval(intervalRef.current!);
              localStorage.removeItem(storageKey);
              onComplete();
              return 0;
            }
            return next;
          });
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="text-2xl font-bold">
      ⏱ {remaining}s
    </div>
  );
};

export default TimerCircle;
