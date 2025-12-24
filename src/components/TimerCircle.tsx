// import React, { useState, useEffect } from 'react';

// export const TimerCircle: React.FC<{ duration: number; start: boolean; key: any }> = ({ duration, start, key }) => {
//     const [timeLeft, setTimeLeft] = useState(duration);
//     const circumference = 2 * Math.PI * 45;

//     useEffect(() => {
//         if (!start) return;
//         setTimeLeft(duration);
//         const interval = setInterval(() => {
//             setTimeLeft(prev => {
//                 if (prev <= 1) {
//                     clearInterval(interval);
//                     return 0;
//                 }
//                 return prev - 1;
//             });
//         }, 1000);

//         return () => clearInterval(interval);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [start, duration, key]);

//     const offset = circumference - (timeLeft / duration) * circumference;

//     return (
//         <div className="relative w-28 h-28 flex items-center justify-center">
//             <svg className="absolute w-full h-full transform -rotate-90 text-slate-200" viewBox="0 0 112 112">
//                 <circle cx="56" cy="56" r="45" stroke="currentColor" strokeWidth="10" fill="transparent" />
//                 <circle
//                     cx="56" cy="56" r="45"
//                     stroke="#E8632A"
//                     strokeWidth="10"
//                     fill="transparent"
//                     strokeDasharray={circumference}
//                     strokeDashoffset={offset}
//                     strokeLinecap="round"
//                     style={{ transition: 'stroke-dashoffset 1s linear' }}
//                 />
//             </svg>
//             <span className="text-4xl font-bold z-10">{timeLeft}</span>
//         </div>
//     );
// };
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

  const [remaining, setRemaining] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Number(saved) : duration;
  });

  // 🔁 Start / resume timer
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;
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

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [questionIndex]);

  // 👁️ Handle tab switch (pause/resume safe)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        // resume timer
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setRemaining(prev => {
              const next = prev - 1;
              localStorage.setItem(storageKey, String(next));
              return next;
            });
          }, 1000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div className="text-2xl font-bold">
      ⏱ {remaining}s
    </div>
  );
};

export default TimerCircle;
