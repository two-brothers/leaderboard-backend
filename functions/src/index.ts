import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { DocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import { Game, GameReference, GameType, Match, ScoredLeaderboardEntry, ScoredResult } from './database.types'


admin.initializeApp()


const LEADERBOARD_SIZE = 10

exports.onMatchCreate = functions.firestore
    .document('matches/{matchId}')
    .onCreate(async (snapshot, context) => {
        const gameRef: GameReference = (snapshot.data() as Match).game
        const gameDoc: DocumentSnapshot = await gameRef.get()
        if (gameDoc.exists) {
            return null
        }
        const game = gameDoc.data() as Game
        const match = snapshot.data() as Match

        switch (game.gameType) {
            case GameType.LOW_SCORE: {
                const leaderboard = game.leaderboard as ScoredLeaderboardEntry[]
                const result = match.result as ScoredResult
                // do a full sort instead of inserting into the right spot
                // the array is small enough that the simplicity outweighs the inefficiency
                const updated = [Object.assign(result, { date: match.date }), ...leaderboard]
                    .sort(lowestScore)
                    .slice(0, LEADERBOARD_SIZE)
                return admin.firestore().doc(gameRef.path).set({ leaderboard: updated }, { merge: true })
            }
            case GameType.HIGH_SCORE: {
                const leaderboard = game.leaderboard as ScoredLeaderboardEntry[]
                const result = match.result as ScoredResult
                // do a full sort instead of inserting into the right spot
                // the array is small enough that the simplicity outweighs the inefficiency
                const updated = [Object.assign(result, { date: match.date }), ...leaderboard]
                    .sort(highestScore)
                    .slice(0, LEADERBOARD_SIZE)
                return admin.firestore().doc(gameRef.path).set({ leaderboard: updated }, { merge: true })
            }
            default:
                return null;
        }

    })

const lowestScore = (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) =>
    // if the scores are the same use the timestamp as a tiebreaker
    a.score === b.score ? a.date.toDate().getTime() - b.date.toDate().getTime() : a.score - b.score

const highestScore = (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) =>
    // if the scores are the same use the timestamp as a tiebreaker
    a.score === b.score ? a.date.toDate().getTime() - b.date.toDate().getTime() : b.score - a.score
