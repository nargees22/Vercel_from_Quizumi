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

  /* ---------------------------- LOAD QUIZ DATA ---------------------------- */

  const loadQuiz = async () => {
    if (!quizId) return;

    setLoading(true);

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
      questions: questionRows.map((q: any) => ({
        id: q.pk_id,
        text: q.question_text,
        options: [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
        correctAnswerIndex: q.correct_answer_index,
        timeLimit: q.time_limit ?? 30,
        type: q.type ?? QuestionType.MCQ,
      })),
    });

    setLoading(false);
  };

  /* ------------------------ REALTIME: QUIZ STATE ------------------------ */

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
        payload => {
          const row = payload.new as QuizMasterRow;

          setQuiz(prev =>
            prev
              ? {
                  ...prev,
                  gameState: row.game_state,
                  currentIndex: row.current_question_index ?? prev.currentIndex,
                  showQuestionToPlayers: row.show_question_to_players,
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
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
        payload => setAnswers(prev => [...prev, payload.new])
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [quizId]);

  /* ---------------------- FETCH LEADERBOARD (THE FIX) ---------------------- */

  useEffect(() => {
    if (!quizId) return;

    if (quiz?.gameState === GameState.LEADERBOARD) {
      supabase
        .from('quiz_players')
        .select('*')
        .eq('quiz_id', quizId)
        .order('score', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('❌ Leaderboard fetch failed', error);
            return;
          }
          setPlayers(data ?? []);
        });
    }
  }, [quiz?.gameState, quizId]);

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
        show_question_to_players: next === GameState.QUESTION_ACTIVE,
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
        <>
          <h2 className="text-xl font-bold mb-4">{question.text}</h2>
          <TimerCircle
            duration={question.timeLimit}
            quizId={quizId}
            questionIndex={quiz.currentIndex}
            onComplete={() => {}}
          />
        </>
      )}

      {quiz.gameState === GameState.QUESTION_RESULT && question && (
        <div className="w-full max-w-3xl">
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
          <Button onClick={() => updateGameState(GameState.QUESTION_RESULT)}>
            Show Results
          </Button>
        )}

        {quiz.gameState === GameState.QUESTION_RESULT && (
          <Button onClick={() => updateGameState(GameState.LEADERBOARD)}>
            {isLastQuestion ? 'Final Leaderboard' : 'Show Leaderboard'}
          </Button>
        )}

        {quiz.gameState === GameState.LEADERBOARD && !isLastQuestion && (
          <Button onClick={() => updateGameState(GameState.QUESTION_ACTIVE)}>
            Next Question
          </Button>
        )}
      </div>
    </div>
  );
};

export default QuizHostPage;
