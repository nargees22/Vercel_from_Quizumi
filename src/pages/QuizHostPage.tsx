import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../service/supabase';
import { PageLoader } from '../components/PageLoader';
import TimerCircle from '../components/TimerCircle';
import { IntermediateLeaderboard } from '../components/IntermediateLeaderboard';
import Button from '../components/Button';
import { GameState, QuestionType } from '../../types';

/* -------------------------------- TYPES -------------------------------- */

interface QuizMasterRow {
  quiz_id: string;
  game_state: GameState;
  current_question_index: number | null;
  show_question_to_players: boolean;
}

interface QuizPlayer {
  quiz_id: string;
  player_id: string;
  player_name: string;
  score: number;
}

/* -------------------------------- COMPONENT -------------------------------- */

const QuizHostPage = () => {
  const { quizId } = useParams<{ quizId: string }>();

  const [quiz, setQuiz] = useState<any>(null);
  const [players, setPlayers] = useState<QuizPlayer[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // const fetchLeaderboard = React.useCallback(async () => {
  //   if (!quizId) return;

  //   const { data, error } = await supabase
  //     .from('quiz_players')
  //     .select('*')
  //     .eq('quiz_id', quizId)
  //     .order('score', { ascending: false });

  //   if (!error && data) {
  //     setPlayers(data);
  //   }
  // };
  const fetchLeaderboard = React.useCallback(async () => {
  if (!quizId) return;

  const { data, error } = await supabase
    .from('quiz_players')
    .select('*')
    .eq('quiz_id', quizId)
    .order('score', { ascending: false });

  if (!error && data) {
    setPlayers(data);
  }
}, [quizId]);

  useEffect(() => {
    if (!quizId) return;

    const channel = supabase
      .channel(`leaderboard-${quizId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quiz_players',
          filter: `quiz_id=eq.${quizId}`,
        },
        () => {
          fetchLeaderboard(); // ✅ DB is source of truth
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [quizId, fetchLeaderboard]);


  /* ---------------------------- LOAD QUIZ DATA ---------------------------- */

  const loadQuiz = async () => {
    if (!quizId) return;

    setLoading(true);

    // const [{ data: quizRow }, { data: questionRows }, { data: playerRows }] =
    const [{ data: quizRow }, { data: questionRows }] =
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

        // supabase
        //   .from('quiz_players')
        //   .select('*')
        //   .eq('quiz_id', quizId)
        //   .order('score', { ascending: false }),
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

    //  setPlayers(playerRows ?? []);
    setLoading(false);
  };
  useEffect(() => {
    if (quizId) {
      fetchLeaderboard();
    }
  }, [quizId,fetchLeaderboard]);

  /* ------------------------ REALTIME: QUIZ STATE ------------------------ */

  useEffect(() => {
    if (!quizId) return;

    loadQuiz(); // initial load only

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
        payload => {
          const row = payload.new as QuizMasterRow;

          setQuiz(prev => {
            if (!prev || !row) return prev;

            return {
              ...prev,
              gameState: row.game_state,
              currentIndex:
                row.current_question_index ?? prev.currentIndex,
              showQuestionToPlayers: row.show_question_to_players,

              // ✅ GUARANTEE CONFIG NEVER DISAPPEARS
              config: prev.config ?? {
                clanBased: false,
                titanName: null,
                defenderName: null,
                clanAssignment: null,
              },
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId]);

  /* ---------------------- REALTIME: PLAYER ANSWERS ---------------------- */

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

    return () => supabase.removeChannel(channel);
  }, [quizId]);
  useEffect(() => {
    setAnswers([]);
  }, [quiz?.currentIndex]);


  /* ---------------------- REALTIME: PLAYER SCORES ---------------------- */

  /* ---------------------- REALTIME: PLAYER SCORES ---------------------- */

  // useEffect(() => {
  //   if (!quizId) return;

  //   const channel = supabase
  //     .channel(`players-${quizId}`)
  //     .on(
  //       'postgres_changes',
  //       {
  //         event: '*',
  //         schema: 'public',
  //         table: 'quiz_players',
  //         filter: `quiz_id=eq.${quizId}`,
  //       },
  //       payload => {
  //         const newPlayer = payload.new as QuizPlayer;

  //         setPlayers(prev => {
  //           const updated = [...prev];
  //           const idx = updated.findIndex(
  //             p => p.player_id === newPlayer.player_id
  //           );

  //           if (idx >= 0) updated[idx] = newPlayer;
  //           else updated.push(newPlayer);

  //           return updated.sort((a, b) => b.score - a.score);
  //         });
  //       }
  //     )
  //     .subscribe();

  //   return () => supabase.removeChannel(channel);
  // }, [quizId]);
  /* ---------------------- FETCH LEADERBOARD ON HOST ---------------------- */
  /* ---------------------- DEBUG: HOST LEADERBOARD ---------------------- */

  useEffect(() => {
    console.log('HOST LEADERBOARD PLAYERS:', players);
  }, [players]);


  /* --------------------------- DERIVED VALUES --------------------------- */

  const question =
    quiz &&
      quiz.questions &&
      quiz.currentIndex >= 0 &&
      quiz.currentIndex < quiz.questions.length
      ? quiz.questions[quiz.currentIndex]
      : null;

  const answerCounts = useMemo(() => {
    if (!question) return [];
    const counts = new Array(question.options.length).fill(0);

    answers
      .filter(a => String(a.question_id) === String(question.id))
      .forEach(a => {
        const idx = a.answer?.index;
        if (typeof idx === 'number') counts[idx]++;
      });

    return counts;
  }, [answers, question]);

  const isLastQuestion =
    quiz && quiz.questions
      ? quiz.currentIndex === quiz.questions.length - 1
      : false;

  /* ---------------------------- GAME STATE UPDATE ---------------------------- */

  const updateGameState = async (next: GameState) => {
    if (!quizId || !quiz) return;

    let nextIndex = quiz.currentIndex;

    if (
      next === GameState.QUESTION_ACTIVE &&
      quiz.gameState === GameState.LEADERBOARD
    ) {
      nextIndex += 1;
    }

    await supabase
      .from('quiz_master_structure')
      .update({
        game_state: next,
        current_question_index: nextIndex,
        show_question_to_players:
          next === GameState.QUESTION_ACTIVE,
      })
      .eq('quiz_id', quizId);
  };


  /* ------------------------------- GUARDS ------------------------------- */

  if (loading) return <PageLoader message="Loading host view..." />;
  if (!quizId || !quiz) return <PageLoader message="Invalid quiz" />;

  /* -------------------------------- UI -------------------------------- */

  return (
    <div className="p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">{quiz.title}</h1>

      {quiz.gameState === GameState.QUESTION_ACTIVE && question && (
        <div className="w-full max-w-3xl mb-8">
          <h2 className="text-xl font-bold mb-4 text-center">
            {question.text}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            {question.options.map((opt: string, i: number) => (
              <div key={i} className="p-4 bg-slate-200 rounded text-center">
                {opt}
              </div>
            ))}
          </div>

          <TimerCircle
  duration={question.timeLimit}
  quizId={quizId}
  questionIndex={quiz.currentIndex}
  onComplete={() => {}} // ❌ HOST should not auto-change state
/>

        </div>
      )}

      {quiz.gameState === GameState.QUESTION_RESULT && question && (
        <div className="w-full max-w-3xl mb-8">
          {question.options.map((opt, i) => (
            <div key={i} className="p-3 bg-slate-200 mb-2 rounded">
              {opt} — {answerCounts[i]} responses
            </div>
          ))}
        </div>
      )}

      {quiz.gameState === GameState.LEADERBOARD && (
        <IntermediateLeaderboard players={players} quiz={quiz} />
      )}

      <div className="mt-8 flex gap-4">
        {quiz.gameState === GameState.QUESTION_ACTIVE && (
          <Button
            onClick={() => updateGameState(GameState.QUESTION_RESULT)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Show Results
          </Button>
        )}

        {quiz.gameState === GameState.QUESTION_RESULT && (
          <Button
            onClick={() => updateGameState(GameState.LEADERBOARD)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            {isLastQuestion ? 'Final Leaderboard' : 'Show Leaderboard'}
          </Button>
        )}


        {quiz.gameState === GameState.LEADERBOARD && !isLastQuestion && (
          <Button
            onClick={() => updateGameState(GameState.QUESTION_ACTIVE)}
            className="bg-gl-orange-600 hover:bg-gl-orange-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Next Question
          </Button>
        )}

      </div>
    </div>
  );
};

export default QuizHostPage;
