import * as admin from 'firebase-admin'
import Timestamp = admin.firestore.Timestamp
import DocumentReference = admin.firestore.DocumentReference

export type PlayerReference = DocumentReference
export type GameReference = DocumentReference

export interface Match {
    date: Timestamp
    game: GameReference
    result: ScoredResult | RankedResult
}

export interface ScoredResult {
    player: PlayerReference
    score: number
}

export interface RankedResult {
    winner: PlayerReference
    loser: PlayerReference
}

export interface Game {
    gameType: GameType
    title: String
    summary: String
    sportId: String
    leaderboard: LeaderboardEntry[]
}

export interface LeaderboardEntry {
    date: Timestamp
    player: PlayerReference
}

export interface ScoredLeaderboardEntry extends LeaderboardEntry {
    score: number
}

export enum GameType {
    RANKED = 0,
    HIGH_SCORE,
    LOW_SCORE
}


