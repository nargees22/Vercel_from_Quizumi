import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../service/supabase';
import { PageLoader } from '../components/PageLoader';
import Button from '../components/Button';
import { GameState } from '../../types';

interface QuestionRow {
  pk_id: number;
  question_text: string;
  option_1?: string;
  option_2?: string;
  option_3?: string;
  option_4?: string;
  correct_answer_index?: number;
  time_limit?: number;
}

const QuizPlayerPage = () => {
  const { quizId } = useParams<{ quizId: string }>();

  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<'correct' | 'wrong' | null>(null);
  const [loading, setLoading] = useState(true);

  const questionStartRef = useRef<number | null>(null);

  // --------------------------------------------------
  // STABLE PLAYER ID (REFRESH SAFE)
  // --------------------------------------------------
  const playerId = useMemo(() => {
    let id = localStorage.getItem('player_id');
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('player_id', id);
    }
    return id;
  }, []);

  // --------------------------------------------------
  // FETCH QUIZ + QUESTIONS
  // --------------------------------------------------
  const fetchData = async () => {
    if (!quizId) return;

    setLoading(true);

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

    if (quizData) setQuiz(quizData);
    if (questionData) setQuestions(questionData);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [quizId]);

  // --------------------------------------------------
  // ENHANCED REALTIME QUIZ STATE SYNC
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
        (payload) => {
          console.log('Real-time update received:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId]);

  // --------------------------------------------------
  // RESET WHEN QUESTION CHANGES
  // --------------------------------------------------
  useEffect(() => {
    setSelectedAnswer(null);
    setAnswerResult(null);
    questionStartRef.current = Date.now();
  }, [quiz?.current_question_index]);

  // --------------------------------------------------
  // JOIN QUIZ (UPSERT SAFE)
  // --------------------------------------------------
  const joinQuiz = async () => {
    await supabase
      .from('quiz_players')
      .upsert(
        {
          quiz_id: quizId,
          player_id: playerId,
          player_name: `Player-${playerId.slice(0, 4)}`,
          score: 0,
        },
        { onConflict: 'quiz_id,player_id' }
      );
  };

  // --------------------------------------------------
  // FETCH LEADERBOARD
  // --------------------------------------------------
  const fetchPlayers = async () => {
    if (!quizId) return;

    const { data } = await supabase
      .from('quiz_players')
      .select('*')
      .eq('quiz_id', quizId)
      .order('score', { ascending: false });

    if (data) setPlayers(data);
  };

  useEffect(() => {
    if (quiz?.game_state === GameState.LEADERBOARD) {
      fetchPlayers();
    }
  }, [quiz?.game_state]);

  // --------------------------------------------------
  // DEBUGGING THE INCREMENT_PLAYER_SCORE RPC
  // --------------------------------------------------
  const handleScoreUpdate = async (score) => {
    const { error } = await supabase.rpc('increment_player_score', {
      p_quiz_id: quizId,
      p_player_id: playerId,
      p_score: score,
    });

    if (error) {
      console.error('Failed to update score:', error);
    } else {
      console.log('Score updated successfully');
    }
  };

  // --------------------------------------------------
  // GUARDS
  // --------------------------------------------------
  if (!quizId) return <PageLoader message="Invalid quiz" />;
  if (loading) return <PageLoader message="Joining quiz..." />;
  if (!quiz) return <PageLoader message="Waiting for host..." />;

  const question =
    typeof quiz.current_question_index === 'number' &&
    quiz.current_question_index >= 0 &&
    quiz.current_question_index < questions.length
      ? questions[quiz.current_question_index]
      : null;

  // --------------------------------------------------
  // LOBBY
  // --------------------------------------------------
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
      const timeLimit = question.time_limit ?? 30;

      let score = 0;
      if (isCorrect) {
        const speedFactor = Math.max(0, 1 - timeTaken / timeLimit);
        score = Math.round(1000 + speedFactor * 1000);
      }

      setAnswerResult(isCorrect ? 'correct' : 'wrong');

      // 1️⃣ Save answer
      await supabase.from('quiz_answers').insert({
        quiz_id: quizId,
        player_id: playerId,
        question_id: String(question.pk_id),
        answer: { index },
        time_taken: timeTaken,
        score,
      });

      // 2️⃣ Atomic score update
      await handleScoreUpdate(score);
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
  // LEADERBOARD
  // --------------------------------------------------
  if (quiz.game_state === GameState.LEADERBOARD) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-center">
          🏆 Leaderboard
        </h1>

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
