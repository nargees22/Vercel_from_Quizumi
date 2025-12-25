import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../service/supabase';
import { PageLoader } from '../components/PageLoader';
import Button from '../components/Button';
import { GameState } from '../../types';
import TimerCircle from '../components/TimerCircle';

interface QuestionRow {
  pk_id: number;
  question_text: string;
  option_1?: string;
  option_2?: string;
  option_3?: string;
  option_4?: string;
  correct_answer_index?: number;
}

interface Quiz {
  quiz_id: string;
  game_state: GameState;
   current_question_index: number;
  show_question_to_players: boolean;
}
interface QuizPlayerRow {
  quiz_id: string;
  player_id: string;
  player_name: string;
  score: number;
}


const QuizPlayerPage = () => {
  //const { quizId } = useParams<{ quizId: string }>();
  const { quizId, playerId } = useParams<{
  quizId: string;
  playerId: string;
}>();
console.log('PLAYER FROM URL', { quizId, playerId });


  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<'correct' | 'wrong' | null>(null);
  const [loading, setLoading] = useState(true);
  const questionStartRef = React.useRef<number | null>(null);
  const [players, setPlayers] = useState<any[]>([]);

  // --------------------------------------------------
  // STABLE PLAYER ID (persists on refresh)
  // --------------------------------------------------
  // const playerId = useMemo(() => {
  //   let id = localStorage.getItem('player_id');
  //   if (!id) {
  //     id = crypto.randomUUID();
  //     localStorage.setItem('player_id', id);
  //   }
  //   return id;
  // }, []);
  console.log('PLAYER ID FROM URL:', playerId);

  const fetchPlayers = async () => {
    if (!quizId) return;

    const { data, error } = await supabase
      .from('quiz_players')
      .select('*')
      .eq('quiz_id', quizId)
      .order('score', { ascending: false });

    if (!error && data) {
      setPlayers(data);
    }
  };
  useEffect(() => {
    if (quiz?.game_state === GameState.LEADERBOARD) {
      fetchPlayers();
    }
  }, [quiz?.game_state]);

  // --------------------------------------------------
  // FETCH QUIZ + QUESTIONS
  // --------------------------------------------------
  // const fetchData = async () => {
  //   if (!quizId) return;

  //   setLoading(true);

  //   const [{ data: quizData }, { data: questionData }] = await Promise.all([
  //     supabase
  //       .from('quiz_master_structure')
  //       .select('*')
  //       .eq('quiz_id', quizId)
  //       .single(),

  //     supabase
  //       .from('quiz_questions')
  //       .select('*')
  //       .eq('quiz_id', quizId)
  //       .order('question_order'),
  //   ]);

  //   if (quizData) {
  //     setQuiz(quizData);

  //     // ✅ REGISTER PLAYER (UPSERT SAFE)

  //   }

  //   if (questionData) setQuestions(questionData);

  //   setLoading(false);
  // };
  const fetchData = async () => {
  if (!quizId) return;

  const [{ data: quizData }, { data: questionData }] = await Promise.all([
    supabase
      .from('quiz_master_structure')
      .select('*')
      .eq('quiz_id', quizId)
      .single(),

    supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('question_order'),
  ]);

  if (quizData) {
    setQuiz(quizData);
  }

  if (questionData) {
    setQuestions(questionData);
  }

  // ✅ CRITICAL
  setLoading(false);
};

  useEffect(() => {
    fetchData();
  }, [quizId]);

const joinQuiz = async () => {
  await supabase
    .from('quiz_players')
    .upsert(
    {
      quiz_id: quizId,
      player_id: playerId!,
      player_name: `Player-${playerId.slice(0, 4)}`,
      score: 0,
    },
    { onConflict: 'quiz_id,player_id' }
  );

  fetchPlayers(); // optional refresh
};

  // --------------------------------------------------
  // REALTIME LISTENER (HOST → PLAYER SYNC)
  // --------------------------------------------------

useEffect(() => {
  if (!quizId) return;

  const channel = supabase
    .channel(`player-quiz-${quizId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'quiz_master_structure',
        filter: `quiz_id=eq.${quizId}`,
      },
      async (payload) => {
        const updatedQuiz = payload.new as Quiz;

        if (!updatedQuiz) return;

        // ✅ REPLACE setQuiz HERE
        setQuiz({
  quiz_id: updatedQuiz.quiz_id,
  game_state: updatedQuiz.game_state,
  current_question_index: updatedQuiz.current_question_index ?? 0,
  show_question_to_players: updatedQuiz.show_question_to_players,
});

      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [quizId]);





//   useEffect(() => {
//     if (!quizId) return;

//     const channel = supabase
//       .channel(`player-quiz-${quizId}`)
//       .on(
//         'postgres_changes',
//         {
//           event: '*',
//           schema: 'public',
//           table: 'quiz_master_structure',
//           filter: `quiz_id=eq.${quizId}`,
//         },
//         async (payload) => {
//           const updatedQuiz = payload.new as Quiz; // Explicitly cast to Quiz type
//           if (updatedQuiz) {
// //             setQuiz(prev => ({
// //   ...prev,
// //   game_state: updatedQuiz.game_state,
// //   currentQuestionIndex:
// //     updatedQuiz.currentQuestionIndex ?? prev?.currentQuestionIndex ?? 0,
// //   show_question_to_players: updatedQuiz.show_question_to_players,
// // }));
// setQuiz(prev => ({
//   ...(prev ?? updatedQuiz),
//   game_state: updatedQuiz.game_state,
//   current_question_index:
//     updatedQuiz.current_question_index ??
//     prev?.current_question_index ??
//     0,
//   show_question_to_players: updatedQuiz.show_question_to_players,
// }));


//             // Fetch updated questions dynamically
//             const { data: updatedQuestions } = await supabase
//               .from('quiz_questions')
//               .select('*')
//               .eq('quiz_id', quizId)
//               .order('question_order');

//             if (updatedQuestions) {
//               setQuestions(updatedQuestions);
//             }
//           }
//         }
//       )
//       .subscribe();

//     return () => supabase.removeChannel(channel);
//   }, [quizId]);
  // --------------------------------------------------
// REALTIME LISTENER (PLAYER SCORES → PLAYER SCREEN)
// --------------------------------------------------
useEffect(() => {
  if (!quizId) return;

  const channel = supabase
    .channel(`player-scores-${quizId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'quiz_players',
        filter: `quiz_id=eq.${quizId}`,
      },
     payload => {
  const newPlayer = payload.new as QuizPlayerRow;

  setPlayers(prev => {
    const updated = [...prev];
    const idx = updated.findIndex(
      p => p.player_id === newPlayer.player_id
    );

    if (idx >= 0) {
      updated[idx] = newPlayer;
    } else {
      updated.push(newPlayer);
    }

    return updated.sort((a, b) => b.score - a.score);
  });
}

    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [quizId]);


// useEffect(() => {
//   if (quiz?.game_state === GameState.QUESTION_ACTIVE) {
//     setLoading(false); // Ensure loading state is updated when the quiz becomes active
//   }
// }, [quiz?.game_state]);

// useEffect(() => {
//   if (quiz?.game_state === GameState.QUESTION_ACTIVE && quizId) {
//     const playerId = localStorage.getItem('player_id');
//     if (playerId) {
//       const newUrl = `/quiz/player/${quizId}/${playerId}`;
//       if (window.location.hash !== `#${newUrl}`) {
//         navigate(newUrl); // Navigate only if the URL is different
//       }
//     }
//   }
// }, [quiz?.game_state, quizId, navigate]);

  // --------------------------------------------------
  // RESET UI ON QUESTION CHANGE
  // --------------------------------------------------
  useEffect(() => {
    setSelectedAnswer(null);
    setAnswerResult(null);

    // ⏱ start timing for this question
    questionStartRef.current = Date.now();
  }, [quiz?.current_question_index]);
 
// useEffect(() => {
//   console.log('QUIZ SYNC', {
//     gameState: quiz.gameState,
//     index: quiz.currentQuestionIndex,
//     question: quiz.questions?.[quiz.currentQuestionIndex]?.text,
//   });
// }, [quiz]);
useEffect(() => {
  if (!quiz) return;

  console.log('QUIZ SYNC', {
    gameState: quiz.game_state,
     index: quiz.current_question_index,
  });
}, [quiz]);



  // --------------------------------------------------
  // GUARDS
  // --------------------------------------------------
  // if (!quizId) return <PageLoader message="Invalid quiz" />;
  // if (loading) return <PageLoader message="Joining quiz..." />;
  // if (!quiz) return <PageLoader message="Waiting for host..." />;
  // --------------------------------------------------
// GUARDS  ✅ MUST COME BEFORE ANY quiz.game_state usage
// --------------------------------------------------
if (!quizId) {
  return <PageLoader message="Invalid quiz" />;
}

if (!quiz) {
  return <PageLoader message="Waiting for quiz to start..." />;
}

if (loading) {
  return <PageLoader message="Joining quiz..." />;
}

  // --------------------------------------------------
// DERIVED QUESTION (🔥 SINGLE SOURCE OF TRUTH)
// --------------------------------------------------
// const question =
//   questions?.[quiz?.currentQuestionIndex ?? -1] ?? null;
const question =
  typeof quiz.current_question_index === 'number'
    ? questions[quiz.current_question_index]
    : null;


  // const question =
  //   typeof quiz.current_question_index === 'number' &&
  //     quiz.current_question_index >= 0 &&
  //     quiz.current_question_index < questions.length
  //     ? questions[quiz.current_question_index]
  //     : null;

  // --------------------------------------------------
  // LOBBY
  // --------------------------------------------------
  // if (quiz?.game_state === GameState.LOBBY) {
  //   return <PageLoader message="Waiting for host to start the quiz..." />;
  // }
  if (quiz.game_state === GameState.LOBBY) {
  return (
    <div className="flex flex-col items-center mt-20 gap-6">
      <h1 className="text-2xl font-bold">
        Waiting for host to start the quiz
      </h1>

      <Button
        onClick={joinQuiz}
        className="bg-gl-orange-600 hover:bg-gl-orange-700"
      >
        Join Quiz
      </Button>
    </div>
  );
}


  // --------------------------------------------------
  // QUESTION VIEW
  // --------------------------------------------------
  if (
    quiz.game_state === GameState.QUESTION_ACTIVE &&
    quiz.show_question_to_players &&
    question
  ) {
    const options = [
      question.option_1,
      question.option_2,
      question.option_3,
      question.option_4,
    ].filter(Boolean);

    const handleSelect = async (index: number) => {
      if (selectedAnswer !== null || !questionStartRef.current) return;

      setSelectedAnswer(index);

      const timeTaken =
        (Date.now() - questionStartRef.current) / 1000;

      const isCorrect = index === question.correct_answer_index;

      // 🎯 TIME-BASED SCORE
      let score = 0;
      if (isCorrect) {
        score = Math.round(
          1000 + Math.max(0, (1 - timeTaken / 30)) * 1000
        );
      }

      setAnswerResult(isCorrect ? 'correct' : 'wrong');

      // 1️⃣ Save answer
      await supabase.from('quiz_answers').insert({
        quiz_id: quizId,
        player_id: playerId!,
       question_id: question.pk_id, // ✅ NUMBER
  // answer: index,      
  answer: {
    index: index,              // ✅ REQUIRED BY HOST
  },
        time_taken: timeTaken,
        score,
      });
console.log('SCORING PLAYER', {
  quizId,
  playerId,
  score
});

     await supabase.rpc('increment_player_score', {
  p_quiz_id: quizId,
  p_player_id: playerId!,
  p_score: score,
});
await fetchPlayers();

        console.log({
  selectedIndex: index,
  correctIndex: question.correct_answer_index,
  question
});

    };

    return (
      <div className="p-6 max-w-3xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-8">
          {question.question_text}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {options.map((opt, index) => {
            let bg = 'bg-slate-200';

            if (selectedAnswer !== null) {
              if (index === question.correct_answer_index)
                bg = 'bg-green-500 text-white';
              else if (index === selectedAnswer)
                bg = 'bg-red-500 text-white';
            }

            return (
              <Button
                key={index}
                className={`p-4 ${bg}`}
                onClick={() => handleSelect(index)}
                disabled={selectedAnswer !== null}
              >
                {opt}
              </Button>
            );
          })}
        </div>

        {answerResult && (
          <div className="mt-6 text-xl font-bold">
            {answerResult === 'correct' ? '✅ Correct!' : '❌ Wrong'}
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------
  // WAITING STATE
  // --------------------------------------------------
  // if (quiz.game_state === GameState.QUESTION_RESULT) {
  //   return <PageLoader message="Waiting for next question..." />;
  // }
  if (quiz.game_state === GameState.LEADERBOARD) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-center">
          🏆 Leaderboard
        </h1>
       

        {players.length === 0 && (
          <p className="text-center text-slate-500">
            No scores yet
          </p>
        )}

        {players.map((player, index) => (
          <div
            key={player.player_id}
            className="flex justify-between items-center bg-white p-4 mb-2 rounded shadow"
          >
            <span className="font-bold">
              #{index + 1} {player.player_name}
            </span>

            <span className="text-gl-orange-600 font-bold">
              {player.score} pts
            </span>
          </div>
        ))}
      </div>
    );
  }

  // --------------------------------------------------
  // FINISHED
  // --------------------------------------------------
  if (quiz.game_state === GameState.FINISHED) {
    return (
      <div className="text-center text-2xl font-bold mt-20">
        🎉 Quiz Finished
      </div>
    );
  }

  return <PageLoader message="Loading..." />;
};

export default QuizPlayerPage;