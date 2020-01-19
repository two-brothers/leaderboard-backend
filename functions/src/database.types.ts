import * as admin from 'firebase-admin'
import Timestamp = admin.firestore.Timestamp
import DocumentReference = admin.firestore.DocumentReference

export type PlayerReference = DocumentReference
export type GameReference = DocumentReference

export interface AbstractMatch {
    date: Timestamp
    game: GameReference
}

export interface ScoredMatch extends AbstractMatch {
    result: {
        player: PlayerReference
        score: number
    }
}

export interface RankedMatch extends AbstractMatch {
    result: {
        winner: PlayerReference
        loser: PlayerReference
    }
}

export type Match = ScoredMatch | RankedMatch

export interface AbstractGame {
    gameType: GameType
    title: String
    summary: String
    sportId: String
}

export interface ScoredGame extends AbstractGame {
    gameType: GameType.HIGH_SCORE | GameType.LOW_SCORE
    leaderboard: ScoredLeaderboardEntry[]
}

export interface RankedGame extends AbstractGame {
    gameType: GameType.RANKED
    leaderboard: RankedLeaderboardEntry[]
    winningStreak: number
}

export type Game = ScoredGame | RankedGame


export interface LeaderboardEntry {
    date: Timestamp
    player: PlayerReference
}

export interface ScoredLeaderboardEntry extends LeaderboardEntry {
    score: number
}

export type RankedLeaderboardEntry = LeaderboardEntry;

export enum GameType {
    RANKED = 0,
    HIGH_SCORE,
    LOW_SCORE
}


