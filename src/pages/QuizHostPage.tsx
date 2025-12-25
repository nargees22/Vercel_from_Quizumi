import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../service/supabase';
import { PageLoader } from '../components/PageLoader';
import TimerCircle from '../components/TimerCircle';
import { IntermediateLeaderboard } from '../components/IntermediateLeaderboard';
import Button from '../components/Button';
import { GameState, QuestionType } from '../../types';
import type { Player } from '../../types';
import { useNavigate } from 'react-router-dom';

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
  avatar?: string | null;
  clan?: string | null;
}

/* -------------------------------- COMPONENT -------------------------------- */

const QuizHostPage = () => {
  const { quizId } = useParams<{ quizId: string }>();
   const navigate = useNavigate();

  //const [quiz, setQuiz] = useState<any>(null);
  const [quiz, setQuiz] = useState<any>({
    currentQuestionIndex: 0,
    gameState: GameState.LOBBY,
    questions: [],
    config: {
      clanBased: false,
      clanNames: {},
      clanAssignment: null,
    },
  });

  //const [players, setPlayers] = useState<QuizPlayer[]>([]);


  const [players, setPlayers] = useState<Player[]>([]);

  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------------------------- LOAD QUIZ DATA ---------------------------- */

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
      currentQuestionIndex: quizRow.current_question_index ?? 0,

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

    // setPlayers(playerRows ?? []);
    setPlayers(
      (playerRows ?? []).map(p => ({
        id: p.player_id,
        name: p.player_name,
        score: p.score,
        avatar: p.avatar ?? '/default-avatar.png',
        clan: p.clan ?? null,
        answers: [], // 🔥 REQUIRED
      }))
    );

    setLoading(false);
  };

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
              currentQuestionIndex:
                row.current_question_index ?? prev.currentQuestionIndex,
              showQuestionToPlayers: row.show_question_to_players,

              // ✅ GUARANTEE CONFIG NEVER DISAPPEARS
              config: prev?.config ?? {
                clanBased: false,
                clanNames: {},
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
        (payload) => {
          const newAnswer = payload.new;
          console.log('Real-time event received:', payload); // Debug log
          if (newAnswer && newAnswer.question_id) {
            setAnswers((prev) => {
              const updatedAnswers = [...prev, newAnswer];
              console.log('Updated answers state:', updatedAnswers); // Debug log
              return updatedAnswers;
            });
          } else {
            console.log('Invalid answer payload:', payload); // Debug log
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [quizId]);

  /* ---------------------- REALTIME: PLAYER SCORES ---------------------- */

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
          // const newPlayer = payload.new as QuizPlayer;
          //const newPlayer = payload.new;
          const newPlayer = payload.new as QuizPlayer;



          setPlayers(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(p => p.id === newPlayer.player_id);

            const mappedPlayer = {
              id: newPlayer.player_id,
              name: newPlayer.player_name,
              score: newPlayer.score,
              avatar: newPlayer.avatar ?? '/default-avatar.png',
              clan: newPlayer.clan ?? null,
              answers: prev[idx]?.answers ?? [],
            };

            if (idx >= 0) updated[idx] = mappedPlayer;
            else updated.push(mappedPlayer);

            return updated.sort((a, b) => b.score - a.score);
          });

        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [quizId]);
  /* ---------------------- FETCH LEADERBOARD ON HOST ---------------------- */

  useEffect(() => {
    if (quiz?.gameState === GameState.LEADERBOARD && quizId) {
      supabase
        .from('quiz_players')
        .select('*')
        .eq('quiz_id', quizId)
        .order('score', { ascending: false })
        .then(({ data }) => {
          // if (data) setPlayers(data);
          if (data) {
            setPlayers(
              data.map(p => ({
                id: p.player_id,
                name: p.player_name,
                score: p.score,
                avatar: p.avatar ?? '/default-avatar.png',
                clan: p.clan ?? null,
                answers: [],
              }))
            );
          }

        });
    }
  }, [quiz?.gameState, quizId]);
  /* ---------------------- DEBUG: HOST PLAYERS ---------------------- */
  useEffect(() => {
    console.log('HOST LEADERBOARD PLAYERS', players);
  }, [players]);


  /* --------------------------- DERIVED VALUES --------------------------- */

  const question =
    quiz &&
      quiz.questions &&
      quiz.currentQuestionIndex >= 0 &&
      quiz.currentQuestionIndex < quiz.questions.length
      ? quiz.questions[quiz.currentQuestionIndex]
      : null;

  const answerCounts = useMemo(() => {
    if (!question || !answers) return [];

    const counts = new Array(question.options.length).fill(0);

    answers
      .filter((a) => {
        // ✅ FIX: normalize IDs (string vs number)
        const isMatchingQuestion =
          String(a.question_id) === String(question.id);

        return isMatchingQuestion;
      })
      .forEach((a) => {
        const idx = a.answer?.index;

        if (typeof idx === 'number' && idx >= 0 && idx < counts.length) {
          counts[idx]++;
        }
      });

    return counts;
  }, [answers, question]);
  useEffect(() => {
    setAnswers([]);
  }, [quiz?.currentQuestionIndex]);


  const isLastQuestion =
    quiz && quiz.questions
      ? quiz.currentQuestionIndex === quiz.questions.length - 1
      : false;

  useEffect(() => {
    console.log('Answers state updated:', answers); // Debug log
    console.log('Question state updated:', question); // Debug log
  }, [answers, question]);

  /* ---------------------------- GAME STATE UPDATE ---------------------------- */

  const fetchLatestAnswers = async () => {
    if (!quizId || !question) return;

    const { data: latestAnswers, error } = await supabase
      .from('quiz_answers')
      .select('*')
      .eq('quiz_id', quizId)
      .eq('question_id', question.id);

    if (error) {
      console.error('Error fetching latest answers:', error);
      return;
    }

    console.log('Fetched latest answers:', latestAnswers); // Debug log
    if (latestAnswers) {
      latestAnswers.forEach((answer) => {
        console.log('Answer details:', answer); // Debug log
      });
    }

    setAnswers(latestAnswers || []);
  };

  // const updateGameState = async (next: GameState) => {
  //   if (!quizId || !quiz) return;

  //   let nextIndex = quiz.currentQuestionIndex;

  //   if (
  //     next === GameState.QUESTION_ACTIVE &&
  //     quiz.gameState === GameState.LEADERBOARD
  //   ) {
  //     nextIndex += 1;
  //   }

  //   if (next === GameState.QUESTION_RESULT) {
  //     await fetchLatestAnswers(); // Fetch latest answers when showing results
  //   }

  //   setQuiz((prev: any) => ({
  //     ...prev,
  //     gameState: next,
  //    // currentIndex: nextIndex,
  //    currentQuestionIndex: nextIndex,


  //     // 🔥 FORCE CONFIG TO ALWAYS EXIST
  //     config: prev?.config ?? {
  //       clanBased: false,
  //       clanNames: {},
  //       clanAssignment: null,
  //     },
  //   }));


  //   await supabase
  //     .from('quiz_master_structure')
  //     .update({
  //       game_state: next,
  //       current_question_index: nextIndex,
  //       show_question_to_players:
  //         next === GameState.QUESTION_ACTIVE,
  //     })
  //     .eq('quiz_id', quizId);
  // };
  const updateGameState = async (next: GameState) => {
    if (!quizId) return;

    let nextIndex = quiz.currentQuestionIndex;

    if (
      next === GameState.QUESTION_ACTIVE &&
      quiz.gameState === GameState.LEADERBOARD
    ) {
      nextIndex += 1; // 🔥 moves to next question
    }

    setQuiz(prev => ({
      ...prev,
      gameState: next,
      currentQuestionIndex: nextIndex,
    }));

    await supabase
      .from('quiz_master_structure')
      .update({
        game_state: next,
        current_question_index: nextIndex,
        show_question_to_players: next === GameState.QUESTION_ACTIVE,
      })
      .eq('quiz_id', quizId);
if (next === GameState.FINISHED) {
    navigate(`/leaderboard/${quizId}`);
  }
      
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
            <p className="text-sm text-gray-500 mb-2">
              Question {quiz.currentQuestionIndex + 1} of {quiz.questions.length}
            </p>
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
            questionIndex={quiz.currentQuestionIndex}
            onComplete={() => { }} // ❌ HOST should not auto-change state
          />

        </div>
      )}

      {quiz.gameState === GameState.QUESTION_RESULT && question && (
        <div className="w-full max-w-3xl mb-8">
          {question.options.map((opt, i) => (
            <div key={i} className="p-3 bg-slate-200 mb-2 rounded">
              {opt} — {answerCounts[i]} {answerCounts[i] === 1 ? 'response' : 'responses'}
            </div>
          ))}
        </div>
      )}

      {/* {quiz.gameState === GameState.LEADERBOARD && (
        <IntermediateLeaderboard players={players} quiz={quiz} />
      )} */}
{quiz.gameState === GameState.LEADERBOARD && !isLastQuestion && (
  <IntermediateLeaderboard players={players} quiz={quiz} />
)}



      {/* {quiz.gameState === GameState.LEADERBOARD && (
  <div className="w-full max-w-xl bg-white rounded-lg p-6 shadow">
    <h2 className="text-2xl font-bold mb-4 text-center">🏆 Leaderboard</h2>

    {players.map((p, i) => (
      <div
        key={p.player_id}
        className="flex justify-between p-3 border-b"
      >
        <span>#{i + 1} {p.player_name}</span>
        <span className="font-bold">{p.score} pts</span>
      </div>
    ))}
  </div>
)} */}

      <div className="mt-8 flex gap-4">
        {quiz.gameState === GameState.QUESTION_ACTIVE && (
          <Button
            onClick={() => updateGameState(GameState.QUESTION_RESULT)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Show Results
          </Button>
        )}

        {/* NORMAL LEADERBOARD */}
        {quiz.gameState === GameState.QUESTION_RESULT && !isLastQuestion && (
          <Button
            onClick={() => updateGameState(GameState.LEADERBOARD)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Show Leaderboard
          </Button>
        )}

        {/* FINAL LEADERBOARD */}
        {quiz.gameState === GameState.QUESTION_RESULT && isLastQuestion && (
          <Button
            onClick={() => updateGameState(GameState.FINISHED)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-bold"
          >
            Show Final Leaderboard
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
