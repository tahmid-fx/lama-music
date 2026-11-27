/** Response contracts for the public v1 API. */
export interface Meta {
  source: string;
  cached: boolean;
  tookMs: number;
}

export interface ArtistSummary {
  id: string;
  name: string;
  sortName: string | null;
  type: string | null;
  country: string | null;
  disambiguation: string | null;
  lifeSpan: { begin: string | null; end: string | null; ended: boolean } | null;
  tags: string[];
  score: number | null;
}

export interface AlbumSummary {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  primaryType: string | null;
  secondaryTypes: string[];
  firstReleaseDate: string | null;
  score: number | null;
  artworkUrl: string | null;
}

export interface TrackSummary {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  album: string | null;
  durationSeconds: number | null;
  score: number | null;
}

export interface AlbumTrack {
  position: number;
  disc: number;
  title: string;
  recordingId: string | null;
  durationSeconds: number | null;
}

export interface AlbumDetail extends AlbumSummary {
  releases: Array<{ id: string; title: string; date: string | null; country: string | null; trackCount: number }>;
  tracks: AlbumTrack[];
  totalDurationSeconds: number | null;
}

export interface SearchResult {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  tracks: TrackSummary[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
