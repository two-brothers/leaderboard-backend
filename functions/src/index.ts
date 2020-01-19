import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { DocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import {
    Game,
    GameReference,
    GameType,
    Match,
    RankedGame,
    RankedLeaderboardEntry,
    RankedMatch,
    ScoredGame,
    ScoredLeaderboardEntry,
    ScoredMatch
} from './database.types'

admin.initializeApp()

const LEADERBOARD_SIZE = 10

exports.onMatchCreate = functions.firestore
    .document('matches/{matchId}')
    .onCreate(async (snapshot) => {
        const gameRef: GameReference = (snapshot.data() as Match).game
        const gameDoc: DocumentSnapshot = await gameRef.get()
        if (!gameDoc.exists) {
            return null
        }
        const game = gameDoc.data() as Game
        const match = snapshot.data() as Match

        // the updates to assign to the game
        let update: Partial<Game>

        switch (game.gameType) {
            case GameType.LOW_SCORE: {
                update = updateGameWithScoredMatch(match as ScoredMatch, game, lowestScore)
                break
            }
            case GameType.HIGH_SCORE: {
                update = updateGameWithScoredMatch(match as ScoredMatch, game, highestScore)
                break
            }
            case GameType.RANKED: {
                update = updateGameWithRankedMatch(match as RankedMatch, game)
                break
            }
            default:
                return null
        }

        if (update.leaderboard) {
            update.leaderboard = update.leaderboard.slice(0, LEADERBOARD_SIZE)
        }
        return admin.firestore().doc(gameRef.path).set(update, { merge: true })
    })

exports.onMatchDelete = functions.firestore
    .document('matches/{matchId}')
    .onDelete((snapshot) => recomputeLeaderboardFor(snapshot))

// in some cases we may not need to recompute the whole leaderboard but it is not worth optimizing
// since the update function is expected to be used infrequently
exports.onMatchUpdate = functions.firestore
    .document('matches/{matchId}')
    .onUpdate((change) => recomputeLeaderboardFor(change.after))


// the array is small enough that the simplicity of a full sort outweighs the inefficiency
const updateGameWithScoredMatch = (match: ScoredMatch, game: ScoredGame, sortFn: (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) => number): Partial<ScoredGame> =>
    ({ leaderboard: [convertScoredMatchToLeaderboardEntry(match), ...game.leaderboard].sort(sortFn) })

const convertScoredMatchToLeaderboardEntry = (match: ScoredMatch): ScoredLeaderboardEntry => Object.assign(match.result, { date: match.date })

const lowestScore = (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) =>
    // if the scores are the same use the timestamp as a tiebreaker
    a.score === b.score ? a.date.toDate().getTime() - b.date.toDate().getTime() : a.score - b.score

const highestScore = (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) =>
    // if the scores are the same use the timestamp as a tiebreaker
    a.score === b.score ? a.date.toDate().getTime() - b.date.toDate().getTime() : b.score - a.score

// this function assumes the specified match occurred after the leaderboard was constructed
// it may modify the leaderboard array in place
const updateGameWithRankedMatch = (match: RankedMatch, game: RankedGame): Partial<RankedGame> => {
    // searching the list backwards has the advantage that a higher array index corresponds
    // to a higher ranking, even if the player is not on the leaderboard (their index is negative)
    // this simplifies the following case enumeration
    const reversed = game.leaderboard.reverse()
    const winnerReversedIdx = reversed.findIndex((entry) => entry.player === match.result.winner)
    const loserReversedIdx = reversed.findIndex((entry) => entry.player === match.result.loser)
    const newEntry: RankedLeaderboardEntry = { date: match.date, player: match.result.winner }

    let leaderboard = game.leaderboard
    const winningStreak = (leaderboard.length === 0 || leaderboard[0].player === match.result.loser) ? 1 :
        (leaderboard[0].player === match.result.loser) ? game.winningStreak + 1 : game.winningStreak

    if (winnerReversedIdx < 0 && loserReversedIdx < 0) { // neither player was on the leaderboard
        leaderboard = [...game.leaderboard, newEntry]
    } else if (winnerReversedIdx > loserReversedIdx) { // the winner was already winning
        // note: this updates the leaderboard objects in place
        reversed[winnerReversedIdx].date = match.date
    } else {
        const loserIdx = leaderboard.length - 1 - loserReversedIdx
        leaderboard = [
            ...leaderboard.slice(0, loserIdx), // everyone strictly before the loser
            newEntry,
            ...leaderboard.slice(loserIdx).filter(entry => entry.player !== match.result.winner) // everyone after the loser (inclusive), removing the winner if necessary
        ]
    }

    return { leaderboard, winningStreak }
}

const recomputeLeaderboardFor = async (snapshot: DocumentSnapshot) => {
    const gameRef: GameReference = (snapshot.data() as Match).game
    const gameDoc: DocumentSnapshot = await gameRef.get()
    if (!gameDoc.exists) {
        return null
    }
    const game = gameDoc.data() as Game
    const matches = await snapshot.ref.parent.where('game', '==', gameRef).get()
        .then(querySnapshot => querySnapshot.docs)
        .then(docs => docs.map(doc => doc.data() as Match))

    const update = recomputeGameUpdateFromMatches(game.gameType, matches)
    if (update.leaderboard) {
        update.leaderboard = update.leaderboard.slice(0, LEADERBOARD_SIZE)
    }
    return admin.firestore().doc(gameRef.path).set(update, { merge: true })
}

const recomputeGameUpdateFromMatches = (gameType: GameType, matches: Match[]): Partial<Game> => {
    switch (gameType) {
        case GameType.LOW_SCORE: {
            return { leaderboard: matches.map(match => convertScoredMatchToLeaderboardEntry(match as ScoredMatch)).sort(lowestScore) }
        }
        case GameType.HIGH_SCORE: {
            return { leaderboard: matches.map(match => convertScoredMatchToLeaderboardEntry(match as ScoredMatch)).sort(highestScore) }
        }
        case GameType.RANKED: {
            const orderedMatches = matches.sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime()) as RankedMatch[]
            // we only want to update the leaderboard and winning streak but we need to pass a Game object to [updateGameWithRankedMatch]
            // use dummy values that we will ignore for the update
            const dummyGame: Game = {
                gameType: GameType.RANKED,
                leaderboard: [],
                winningStreak: 0,
                sportId: '',
                summary: '',
                title: ''
            }
            for (const nextMatch of orderedMatches) {
                Object.assign(dummyGame, updateGameWithRankedMatch(nextMatch, dummyGame))
            }
            return { leaderboard: dummyGame.leaderboard, winningStreak: dummyGame.winningStreak }
        }
        default:
            return {}
    }
}


