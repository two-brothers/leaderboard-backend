const functions = require('firebase-functions')
const admin = require('firebase-admin')


admin.initializeApp()

exports.onMatchUpdate = functions.firestore
    .document('matches/{matchId}')
    .onWrite(async (change, context) => {
        // for now let's recompute the whole leaderboard
        const matchesRef = change.after.ref.parent
        const gameRef = change.after.data().game

        const gameDoc = await gameRef.get()
        if (!gameDoc.exists) {
            return null
        }

        const gameType = gameDoc.data().gameType
        const matches = await matchesRef.where('game', '==', gameRef)
            .get()
            .then(querySnapshot => querySnapshot.docs)
            .then(docs => docs.map(doc => doc.data()))

        switch (gameType) {
            case 2: {
                const LEADERBOARD_SIZE = 10
                const rankedMatches = matches.sort((a, b) =>
                    a.result.score === b.result.score ?
                        a.date.toDate().getTime() - b.date.toDate().getTime() : // if the scores are the same, use the timestamp as a tiebreaker
                        a.result.score - b.result.score
                )
                const topMatches = rankedMatches.slice(0, LEADERBOARD_SIZE)
                const titles = topMatches.map(match => ({
                    date: match.date,
                    player: match.result.player,
                    score: match.result.score
                }))

                return admin.firestore().doc(gameRef.path).set({leaderboard: titles}, {merge: true})
            }
            default:
                break
        }
        return null
    })
