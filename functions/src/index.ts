import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { DocumentSnapshot } from 'firebase-functions/lib/providers/firestore'
import {
    Game,
    GameReference,
    GameType, LeaderboardEntry,
    Match,
    RankedResult,
    ScoredLeaderboardEntry,
    RankedLeaderboardEntry,
    ScoredResult
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

        let updated
        switch (game.gameType) {
            case GameType.LOW_SCORE: {
                updated = addScoredMatchToLeaderboardAndSort(match, game.leaderboard, lowestScore)
                break
            }
            case GameType.HIGH_SCORE: {
                updated = addScoredMatchToLeaderboardAndSort(match, game.leaderboard, highestScore)
                break
            }
            case GameType.RANKED: {
                updated = addRankedMatchToLeaderboard(game.leaderboard as RankedLeaderboardEntry[], match)
                break
            }
            default:
                return null
        }

        updated = updated.slice(0, LEADERBOARD_SIZE)
        return admin.firestore().doc(gameRef.path).set({ leaderboard: updated }, { merge: true })
    })

exports.onMatchDelete = functions.firestore
    .document('matches/{matchId}')
    .onDelete((snapshot) => recomputeLeaderboardAssociatedWithSnapshot(snapshot))

// in some cases we may not need to recompute the whole leaderboard but it is not worth optimizing
// since the update function is expected to be used infrequently
exports.onMatchUpdate = functions.firestore
    .document('matches/{matchId}')
    .onUpdate((change) => recomputeLeaderboardAssociatedWithSnapshot(change.after))


// the array is small enough that the simplicity of a full sort outweighs the inefficiency
const addScoredMatchToLeaderboardAndSort = (match: Match, leaderboard: LeaderboardEntry[], sortFn: (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) => number): ScoredLeaderboardEntry[] =>
    [convertMatchToScoredLeaderboardEntry(match), ...leaderboard as ScoredLeaderboardEntry[]].sort(sortFn)


const lowestScore = (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) =>
    // if the scores are the same use the timestamp as a tiebreaker
    a.score === b.score ? a.date.toDate().getTime() - b.date.toDate().getTime() : a.score - b.score

const highestScore = (a: ScoredLeaderboardEntry, b: ScoredLeaderboardEntry) =>
    // if the scores are the same use the timestamp as a tiebreaker
    a.score === b.score ? a.date.toDate().getTime() - b.date.toDate().getTime() : b.score - a.score

// this function assumes the specified match occurred after the leaderboard was constructed
// it may modify the leaderboard array in place
const addRankedMatchToLeaderboard = (leaderboard: RankedLeaderboardEntry[], match: Match): RankedLeaderboardEntry[] => {
    // this function assumes the leaderboard is small enough to prefer simple algorithms to efficient ones
    const result = match.result as RankedResult

    // searching the list backwards has the advantage that a higher array index corresponds
    // to a higher ranking, even if the player is not on the leaderboard (their index is negative)
    // this simplifies the following case enumeration
    const reversed = leaderboard.reverse()
    const winnerReversedIdx = reversed.findIndex((entry) => entry.player === result.winner)
    const loserReversedIdx = reversed.findIndex((entry) => entry.player === result.loser)
    const newEntry: RankedLeaderboardEntry = {
        date: match.date,
        player: result.winner,
        // if the winner is not on the leaderboard, set consecutiveWins to 1, otherwise increment it
        consecutiveWins: winnerReversedIdx < 0 ? 1 : reversed[winnerReversedIdx].consecutiveWins + 1
    }

    if (winnerReversedIdx < 0 && loserReversedIdx < 0) { // neither player was on the leaderboard
        return leaderboard.length < LEADERBOARD_SIZE ?
            [...leaderboard, newEntry] :
            leaderboard
    }

    if (winnerReversedIdx > loserReversedIdx) { // the winner was already winning
        // note: this updates the leaderboard objects in place
        reversed[winnerReversedIdx].date = match.date
        reversed[winnerReversedIdx].consecutiveWins += 1
        return leaderboard
    }

    const loserIdx = leaderboard.length - 1 - loserReversedIdx
    const updated = [
        ...leaderboard.slice(0, loserIdx), // everyone strictly before the loser
        newEntry,
        ...leaderboard.slice(loserIdx).filter(entry => entry.player != result.winner) // everyone after the loser (inclusive), removing the winner if necessary
    ]
    return updated.slice(0, LEADERBOARD_SIZE)
}

const recomputeLeaderboardAssociatedWithSnapshot = async (snapshot: DocumentSnapshot) => {
    const gameRef: GameReference = (snapshot.data() as Match).game
    const gameDoc: DocumentSnapshot = await gameRef.get()
    if (!gameDoc.exists) {
        return null
    }
    const game = gameDoc.data() as Game
    const matches = await snapshot.ref.parent.where('game', '==', gameRef).get()
        .then(querySnapshot => querySnapshot.docs)
        .then(docs => docs.map(doc => doc.data() as Match))

    let updated = recomputeLeaderboardFromMatches(game.gameType, matches)
    updated = updated.slice(0, LEADERBOARD_SIZE)
    return admin.firestore().doc(gameRef.path).set({ leaderboard: updated }, { merge: true })
}

const recomputeLeaderboardFromMatches = (gameType: GameType, matches: Match[]): LeaderboardEntry[] => {
    let leaderboard
    switch (gameType) {
        case GameType.LOW_SCORE: {
            leaderboard = matches.map(match => convertMatchToScoredLeaderboardEntry(match)).sort(lowestScore)
            break
        }
        case GameType.HIGH_SCORE: {
            leaderboard = matches.map(match => convertMatchToScoredLeaderboardEntry(match)).sort(highestScore)
            break
        }
        case GameType.RANKED: {
            leaderboard = matches.sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime())
                .reduce(addRankedMatchToLeaderboard, [])
            break
        }
        default:
            return []
    }
    return leaderboard.slice(0, LEADERBOARD_SIZE)
}

// assumes match.result is a ScoredResult
const convertMatchToScoredLeaderboardEntry = (match: Match): ScoredLeaderboardEntry => Object.assign(match.result as ScoredResult, { date: match.date })
