import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../service/supabase';
import { PageLoader } from '../components/PageLoader';
import { TimerCircle } from '../components/TimerCircle';
import { IntermediateLeaderboard } from '../components/IntermediateLeaderboard';
import Button from '../components/Button';
import { GameState, QuestionType } from '../../types';
interface QuizPlayer {
  quiz_id: string;
  player_id: string;
  player_name: string;
  score: number;
}

const QuizHostPage = () => {
  const { quizId } = useParams<{ quizId: string }>();

  const [quiz, setQuiz] = useState<any>(null);
  
  //const [players, setPlayers] = useState<any[]>([]);
  const [players, setPlayers] = useState<QuizPlayer[]>([]);

  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timerCompleted, setTimerCompleted] = useState(false);

  // --------------------------------------------------
  // LOAD QUIZ DATA
  // --------------------------------------------------
  const loadQuiz = async () => {
    if (!quizId) return;

    setLoading(true);

    const [{ data: quizRow }, { data: questionRows }, { data: playerRows }] =
      await Promise.all([
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

        supabase
          .from('quiz_players')
          .select('*')
          .eq('quiz_id', quizId)
          .order('score', { ascending: false }),
      ]);

    if (!quizRow || !questionRows) {
      setLoading(false);
      return;
    }

    setQuiz({
      id: quizRow.quiz_id,
      title: quizRow.title,
      gameState: quizRow.game_state,
      currentIndex: quizRow.current_question_index ?? 0,
      showQuestionToPlayers: quizRow.show_question_to_players,

      config: {
        clanBased: quizRow.clan_based ?? false,
        titanName: quizRow.titan_name ?? null,
        defenderName: quizRow.defender_name ?? null,
        clanAssignment: quizRow.clan_assignment ?? null,
      },

      questions: questionRows.map((q: any) => ({
        id: q.pk_id,
        text: q.question_text,
        options: [
          q.option_1,
          q.option_2,
          q.option_3,
          q.option_4,
        ].filter(Boolean),
        correctAnswerIndex: q.correct_answer_index,
        timeLimit: q.time_limit ?? 30,
        type: q.type ?? QuestionType.MCQ,
      })),
    });

    setPlayers(playerRows ?? []);
    setLoading(false);
  };

  // --------------------------------------------------
  // REALTIME: QUIZ STATE
  // --------------------------------------------------
  useEffect(() => {
    if (!quizId) return;

    loadQuiz();

    const channel = supabase
      .channel(`host-${quizId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quiz_master_structure',
          filter: `quiz_id=eq.${quizId}`,
        },
        loadQuiz
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId]);
useEffect(() => {
  if (quiz?.gameState === GameState.LEADERBOARD && quizId) {
    supabase
      .from('quiz_players')
      .select('*')
      .eq('quiz_id', quizId)
      .order('score', { ascending: false })
      .then(({ data }) => {
        if (data) setPlayers(data);
      });
  }
}, [quiz?.gameState, quizId]);


  // --------------------------------------------------
  // RESET ANSWERS & TIMER WHEN QUESTION CHANGES
  // --------------------------------------------------
  useEffect(() => {
    setAnswers([]);
    setTimerCompleted(false);
  }, [quiz?.currentIndex]);

  // --------------------------------------------------
  // REALTIME: PLAYER ANSWERS
  // --------------------------------------------------
  useEffect(() => {
    if (!quizId) return;

    const channel = supabase
      .channel(`answers-${quizId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quiz_answers',
          filter: `quiz_id=eq.${quizId}`,
        },
        payload => {
          setAnswers(prev => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId]);
// --------------------------------------------------
// REALTIME: PLAYER SCORES (LEADERBOARD FIX 🔥)
// --------------------------------------------------
// --------------------------------------------------
// REALTIME: PLAYER SCORES (LEADERBOARD FIX 🔥)
// --------------------------------------------------
useEffect(() => {
  if (!quizId) return;

  const channel = supabase
    .channel(`players-${quizId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'quiz_players',
        filter: `quiz_id=eq.${quizId}`,
      },
      payload => {
        const newPlayer = payload.new as QuizPlayer; // ✅ FIX

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

  // --------------------------------------------------
  // CURRENT QUESTION
  // --------------------------------------------------
  const question =
    quiz &&
    quiz.questions &&
    quiz.currentIndex >= 0 &&
    quiz.currentIndex < quiz.questions.length
      ? quiz.questions[quiz.currentIndex]
      : null;

  // --------------------------------------------------
  // ANSWER COUNTS
  // --------------------------------------------------
  const answerCounts = useMemo(() => {
    if (!question || !quiz) return [];

    const counts = new Array(question.options.length).fill(0);

    answers
  .filter(a => String(a.question_id) === String(question.id))
  .forEach(a => {
    const answerIndex = a.answer?.index;
    if (typeof answerIndex === 'number') {
      counts[answerIndex]++;
    }
  });

    return counts;
  }, [answers, question, quiz]);

  // --------------------------------------------------
  // GAME STATE UPDATE (CLEAN)
  // --------------------------------------------------
  // const updateGameState = async (next: GameState) => {
  //   if (!quizId || !quiz) return;

  //   let nextIndex = quiz.currentIndex;

  //   if (
  //     next === GameState.QUESTION_ACTIVE &&
  //     quiz.gameState === GameState.LEADERBOARD
  //   ) {
  //     nextIndex = quiz.currentIndex + 1;
  //   }

  //   setQuiz((prev: any) => ({
  //     ...prev,
  //     gameState: next,
  //     currentIndex: nextIndex,
  //   }));

  //  await supabase
  // .from('quiz_master_structure')
  // .update({
  //   game_state: next,
  //   current_question_index: nextIndex,
  //   show_question_to_players: next === GameState.QUESTION_ACTIVE,
  //   question_started_at:
  //     next === GameState.QUESTION_ACTIVE ? new Date().toISOString() : null,
  // })
  //     .eq('quiz_id', quizId);
  // };
const updateGameState = async (next: GameState) => {
  if (!quizId || !quiz) return;

  let nextIndex = quiz.currentIndex;

  // move index ONLY when starting next question
  if (
    next === GameState.QUESTION_ACTIVE &&
    quiz.gameState === GameState.LEADERBOARD
  ) {
    nextIndex = quiz.currentIndex + 1;
  }

  setQuiz((prev: any) => ({
    ...prev,
    gameState: next,
    currentIndex: nextIndex,
  }));

  await supabase
    .from('quiz_master_structure')
    .update({
      game_state: next,
      current_question_index: nextIndex,
      show_question_to_players: next === GameState.QUESTION_ACTIVE,
      ...(next === GameState.QUESTION_ACTIVE && {
        question_started_at: new Date().toISOString(), // ✅ ONLY HERE
      }),
    })
    .eq('quiz_id', quizId);
};

  // const isLastQuestion =
  // quiz.currentIndex === quiz.questions.length - 1;
const isLastQuestion = useMemo(() => {
  if (!quiz || !quiz.questions) return false;
  return quiz.currentIndex === quiz.questions.length - 1;
}, [quiz]);


  // --------------------------------------------------
  // TIMER (ONLY IN QUESTION_ACTIVE)
  // --------------------------------------------------
  const TimerSection = () => {
    if (!question || quiz.gameState !== GameState.QUESTION_ACTIVE) return null;

    return (
      <div className="mt-6 flex justify-center">
        <TimerCircle
          duration={question.timeLimit}
          start
          onComplete={() => updateGameState(GameState.QUESTION_RESULT)}
        />
      </div>
    );
  };

  // --------------------------------------------------
  // GUARDS
  // --------------------------------------------------
  if (loading) return <PageLoader message="Loading host view..." />;
  if (!quizId || !quiz) return <PageLoader message="Invalid quiz" />;

  // --------------------------------------------------
  // UI
  // --------------------------------------------------
  return (
    <div className="p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">{quiz.title}</h1>

      {/* QUESTION */}
      {quiz.gameState === GameState.QUESTION_ACTIVE && question && (
        <div className="w-full max-w-3xl mb-8">
          <h2 className="text-sm text-slate-500 mb-2 text-center">
      Question {quiz.currentIndex + 1} of {quiz.questions.length}
    </h2>
          <h2 className="text-xl font-bold mb-6 text-center">
            {question.text}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {question.options.map((opt: string, index: number) => (
              <div
                key={index}
                className="p-4 bg-slate-200 rounded-lg text-center font-semibold"
              >
                {opt}
              </div>
            ))}
          </div>

          <TimerSection />
        </div>
      )}

      {/* RESULTS */}
      {quiz.gameState === GameState.QUESTION_RESULT && question && (
        <div className="w-full max-w-3xl mb-8">
          <h2 className="text-xl font-bold mb-6 text-center">
            Results for: {question.text}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {question.options.map((opt, index) => (
              <div
                key={index}
                className="p-4 bg-slate-200 rounded-lg text-center font-semibold"
              >
                {opt}
                <div className="text-sm text-gray-600">
                  {answerCounts[index]} responses
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEADERBOARD */}
{quiz.gameState === GameState.LEADERBOARD && (
  <div className="w-full max-w-3xl mb-8">
    <IntermediateLeaderboard
      players={players}
      quiz={quiz}
      animate
    />
  </div>
)}


      {/* CONTROLS */}
    
             <div className="mt-8 flex gap-4">
  {/* QUESTION → RESULT */}
 {/* QUESTION → RESULT */}
  {quiz.gameState === GameState.QUESTION_ACTIVE && (
    <Button
      onClick={() => updateGameState(GameState.QUESTION_RESULT)}
      className="bg-green-600 hover:bg-green-700"
    >
      Show Results
    </Button>
  )}

  {/* RESULT → LEADERBOARD */}
  {quiz.gameState === GameState.QUESTION_RESULT && (
    <Button
      onClick={() => updateGameState(GameState.LEADERBOARD)}
      className={isLastQuestion
        ? 'bg-gl-orange-600 hover:bg-gl-orange-700'
        : 'bg-blue-600 hover:bg-blue-700'}
    >
      {isLastQuestion ? 'Final Leaderboard' : 'Show Leaderboard'}
    </Button>
  )}

  {/* LEADERBOARD → NEXT QUESTION */}
  {quiz.gameState === GameState.LEADERBOARD && !isLastQuestion && (
    <Button
      onClick={() => updateGameState(GameState.QUESTION_ACTIVE)}
      className="bg-gl-orange-600 hover:bg-gl-orange-700"
    >
      Next Question
    </Button>
  )}


  
</div>

    </div>
  );
};

export default QuizHostPage; 