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

  // Log the quizId to debug its value
  console.log('Current quizId:', quizId);

  // Simple log to verify logging functionality
  console.log('QuizHostPage rendered');

  const [quiz, setQuiz] = useState<any>(null);
  const [players, setPlayers] = useState<QuizPlayer[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------------------------- LOAD QUIZ DATA ---------------------------- */

  const loadQuiz = async () => {
    if (!quizId) return;

    setLoading(true);

    const [{ data: quizRow }, { data: questionRows }] = await Promise.all([
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
      config: {
        clanBased: quizRow.clan_based ?? false,
        titanName: quizRow.titan_name ?? null,
        defenderName: quizRow.defender_name ?? null,
        clanAssignment: quizRow.clan_assignment ?? null,
      },
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

  const fetchData = async () => {
    if (!quizId) return;

    const { data: quizData } = await supabase
      .from('quiz_master_structure')
      .select('*')
      .eq('quiz_id', quizId)
      .single();

    const { data: questionData } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('question_order', { ascending: true });

    const { data: playerData } = await supabase
      .from('quiz_players')
      .select('*')
      .eq('quiz_id', quizId);

    if (!quizData || !questionData) return;

    const mappedQuestions = questionData.map((q) => ({
      id: q.pk_id,
      text: q.question_text,
      options: [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
      correctAnswerIndex: q.correct_answer_index,
      timeLimit: q.time_limit,
      type: q.type,
    }));

    setQuiz({
      id: quizData.quiz_id,
      title: quizData.title,
      gameState: quizData.game_state,
      currentQuestionIndex: quizData.current_question_index ?? 0,
      questions: mappedQuestions,
      config: {
        clanBased: quizData.clan_based,
      },
    });

    if (playerData) {
      setPlayers(
        playerData.map((p) => ({
          id: p.player_id,
          name: p.player_name,
          avatar: p.avatar,
          score: p.score,
          clan: p.clan,
        }))
      );
    }
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

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`host-room-${quizId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quiz_players', filter: `quiz_id=eq.${quizId}` },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quiz_master_structure', filter: `quiz_id=eq.${quizId}` },
        () => fetchData()
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
        payload => setAnswers(prev => [...prev, payload.new])
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [quizId]);

  /* ---------------------- FETCH LEADERBOARD ---------------------- */

  // Add a log to confirm the useEffect is triggered
  useEffect(() => {
    console.log('useEffect triggered for fetching players');
    if (quiz?.gameState === GameState.LEADERBOARD && quizId) {
      console.log('Fetching players for quizId:', quizId);
      supabase
        .from('quiz_players')
        .select('*')
        .eq('quiz_id', quizId)
        .order('score', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching players:', error);
          } else {
            console.log('Fetched players:', data);
            setPlayers(data ?? []);
          }
        });
    }
  }, [quiz?.gameState, quizId]);

  // Debugging: Log the players state to verify data
  useEffect(() => {
    console.log('Players state:', players);
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

    // Update game state in the database
    const { error } = await supabase
      .from('quiz_master_structure')
      .update({
        game_state: next,
        current_question_index: nextIndex,
        show_question_to_players: next === GameState.QUESTION_ACTIVE,
      })
      .eq('quiz_id', quizId);

    if (error) {
      console.error('Failed to update game state:', error);
      return;
    }

    // Force state update for immediate UI refresh
    if (next === GameState.QUESTION_RESULT) {
      const { data: updatedAnswers, error: answersError } = await supabase
        .from('quiz_answers')
        .select('*')
        .eq('quiz_id', quizId);

      if (answersError) {
        console.error('Failed to fetch updated answers:', answersError);
      } else {
        setAnswers(updatedAnswers ?? []);
      }
    }

    setQuiz((prev: any) => ({
      ...prev,
      gameState: next,
      currentIndex: nextIndex,
      showQuestionToPlayers: next === GameState.QUESTION_ACTIVE,
    }));
  };

  /* ------------------------------- GUARDS ------------------------------- */

  if (loading) return <PageLoader message="Loading host view..." />;
  if (!quizId || !quiz) return <PageLoader message="Invalid quiz" />;

  // Debugging: Log the quiz object before rendering the leaderboard
  console.log('Quiz object:', quiz);

  const renderContent = () => {
    switch (quiz?.gameState) {
      case GameState.LEADERBOARD:
        return <IntermediateLeaderboard players={players} quiz={quiz} animate />;
      default:
        return <div>Loading...</div>;
    }
  };

  /* -------------------------------- UI -------------------------------- */

  return (
    <div className="p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">{quiz?.title}</h1>
      {renderContent()}
    </div>
  );
};

export default QuizHostPage;
