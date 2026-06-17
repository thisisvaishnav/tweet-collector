package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/lib/pq"
)

var DB *sql.DB

// Tweet represents the database schema for a tweet
type Tweet struct {
	ID             string     `json:"id"`
	Text           string     `json:"text"`
	Author         string     `json:"author"`
	Followers      int        `json:"followers"`
	Likes          int        `json:"likes"`
	Replies        int        `json:"replies"`
	Reposts        int        `json:"reposts"`
	Views          int        `json:"views"`
	EngagementRate float64    `json:"engagement_rate"`
	Pattern        string     `json:"pattern"`
	Embedding      []float64  `json:"embedding,omitempty"`
	URL            string     `json:"url"`
	CreatedAt      string     `json:"created_at"`
	IsViral        bool       `json:"is_viral"`
	IsCandidate    bool       `json:"is_candidate"`
	HookText       string     `json:"hook_text"`
	HookType       string     `json:"hook_type"`
	StructureNotes string     `json:"structure_notes"`
	LabelSource    string     `json:"label_source"`
}

// InitDB connects to PostgreSQL, creates the database if it doesn't exist, and sets up tables.
func InitDB() error {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Default to local postgresql with bombermac user
		connStr = "postgres://bombermac@localhost:5432/postgres?sslmode=disable"
	}

	// Parse connection string to get the database name and connect to "postgres" first to create the DB if needed
	u, err := url.Parse(connStr)
	if err != nil {
		return fmt.Errorf("failed to parse connection string: %v", err)
	}

	dbName := strings.TrimPrefix(u.Path, "/")
	if dbName == "" {
		dbName = "tweet_collector"
	}

	// Connect directly for hosted databases (like Neon, Supabase, AWS RDS, etc.)
	isLocalhost := u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == ""

	if !isLocalhost {
		log.Printf("Connecting directly to hosted database: %s (db: %s)", u.Host, dbName)
		DB, err = sql.Open("postgres", connStr)
		if err != nil {
			return fmt.Errorf("failed to connect to database: %v", err)
		}
		if err = DB.Ping(); err != nil {
			return fmt.Errorf("failed to ping database: %v", err)
		}
		log.Printf("Connected successfully to database.")
		if err = runMigrations(); err != nil {
			return fmt.Errorf("failed to run migrations: %v", err)
		}
		return nil
	}

	// Temporarily point to default "postgres" db to check/create the target database
	u.Path = "/postgres"
	tempConnStr := u.String()

	tempDb, err := sql.Open("postgres", tempConnStr)
	if err != nil {
		return fmt.Errorf("failed to connect to temporary database: %v", err)
	}
	defer tempDb.Close()

	// Check if database exists
	var exists bool
	query := fmt.Sprintf("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '%s')", dbName)
	err = tempDb.QueryRow(query).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check if database exists: %v", err)
	}

	if !exists {
		log.Printf("Database %s does not exist. Creating it...", dbName)
		// Databases cannot be created inside transaction blocks
		_, err = tempDb.Exec(fmt.Sprintf("CREATE DATABASE %s", dbName))
		if err != nil {
			return fmt.Errorf("failed to create database %s: %v", dbName)
		}
		log.Printf("Database %s created successfully.", dbName)
	}

	// Now connect to the actual target database
	u.Path = "/" + dbName
	actualConnStr := u.String()

	DB, err = sql.Open("postgres", actualConnStr)
	if err != nil {
		return fmt.Errorf("failed to connect to target database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping target database: %v", err)
	}

	log.Printf("Connected to PostgreSQL database: %s", dbName)

	// Run migrations
	if err = runMigrations(); err != nil {
		return fmt.Errorf("failed to run migrations: %v", err)
	}

	return nil
}

func runMigrations() error {
	query := `
	CREATE TABLE IF NOT EXISTS tweets (
		id VARCHAR(100) PRIMARY KEY,
		text TEXT NOT NULL,
		author VARCHAR(255) NOT NULL,
		followers INTEGER DEFAULT 0,
		likes INTEGER DEFAULT 0,
		replies INTEGER DEFAULT 0,
		reposts INTEGER DEFAULT 0,
		views INTEGER DEFAULT 0,
		engagement_rate DOUBLE PRECISION DEFAULT 0.0,
		pattern VARCHAR(100) DEFAULT 'Unclassified',
		embedding float8[] DEFAULT NULL,
		url TEXT NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := DB.Exec(query)
	if err != nil {
		return err
	}

	// Alter table queries to add new columns if they do not exist
	alterQueries := []string{
		`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS is_viral BOOLEAN DEFAULT FALSE;`,
		`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS is_candidate BOOLEAN DEFAULT TRUE;`,
		`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS hook_text TEXT DEFAULT '';`,
		`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS hook_type VARCHAR(50) DEFAULT '';`,
		`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS structure_notes TEXT DEFAULT '';`,
		`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS label_source VARCHAR(50) DEFAULT '';`,
	}
	for _, q := range alterQueries {
		if _, err := DB.Exec(q); err != nil {
			log.Printf("Migration alter error: %v", err)
			return err
		}
	}

	log.Println("Database tables and columns initialized successfully.")
	return nil
}

// SaveTweet inserts or updates a tweet in the database
func SaveTweet(t *Tweet) error {
	query := `
	INSERT INTO tweets (id, text, author, followers, likes, replies, reposts, views, engagement_rate, url, is_viral, is_candidate)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	ON CONFLICT (id) DO UPDATE SET
		text = EXCLUDED.text,
		author = EXCLUDED.author,
		followers = EXCLUDED.followers,
		likes = EXCLUDED.likes,
		replies = EXCLUDED.replies,
		reposts = EXCLUDED.reposts,
		views = EXCLUDED.views,
		engagement_rate = EXCLUDED.engagement_rate,
		url = EXCLUDED.url,
		is_viral = EXCLUDED.is_viral,
		is_candidate = EXCLUDED.is_candidate;
	`
	_, err := DB.Exec(
		query,
		t.ID,
		t.Text,
		t.Author,
		t.Followers,
		t.Likes,
		t.Replies,
		t.Reposts,
		t.Views,
		t.EngagementRate,
		t.URL,
		t.IsViral,
		t.IsCandidate,
	)
	return err
}

// UpdateTweetAI updates the pattern and embedding columns for a tweet
func UpdateTweetAI(id string, pattern string, embedding []float64) error {
	var err error
	if len(embedding) > 0 {
		query := `UPDATE tweets SET pattern = $1, embedding = $2 WHERE id = $3;`
		_, err = DB.Exec(query, pattern, pq.Array(embedding), id)
	} else {
		query := `UPDATE tweets SET pattern = $1 WHERE id = $2;`
		_, err = DB.Exec(query, pattern, id)
	}
	return err
}

// UpdateTweetAdvancedAI updates the AI classification details for a tweet
func UpdateTweetAdvancedAI(id string, pattern string, hookText string, hookType string, notes string, source string, embedding []float64) error {
	var err error
	if len(embedding) > 0 {
		query := `UPDATE tweets SET pattern = $1, hook_text = $2, hook_type = $3, structure_notes = $4, label_source = $5, embedding = $6 WHERE id = $7;`
		_, err = DB.Exec(query, pattern, hookText, hookType, notes, source, pq.Array(embedding), id)
	} else {
		query := `UPDATE tweets SET pattern = $1, hook_text = $2, hook_type = $3, structure_notes = $4, label_source = $5 WHERE id = $6;`
		_, err = DB.Exec(query, pattern, hookText, hookType, notes, source, id)
	}
	return err
}

// GetTweets retrieves tweets matching search, filters, sorted by selected field
func GetTweets(search string, pattern string, sortBy string, limit int) ([]Tweet, error) {
	var tweets []Tweet
	var conditions []string
	var args []interface{}
	argCount := 1

	// Base query
	baseQuery := `SELECT id, text, author, followers, likes, replies, reposts, views, engagement_rate, pattern, embedding, url, created_at, is_viral, is_candidate, hook_text, hook_type, structure_notes, label_source FROM tweets`

	if search != "" {
		conditions = append(conditions, fmt.Sprintf("(text ILIKE $%d OR author ILIKE $%d)", argCount, argCount))
		args = append(args, "%"+search+"%")
		argCount++
	}

	if pattern != "" && pattern != "All" {
		conditions = append(conditions, fmt.Sprintf("pattern = $%d", argCount))
		args = append(args, pattern)
		argCount++
	}

	if len(conditions) > 0 {
		baseQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	// Sorting
	switch sortBy {
	case "engagement":
		baseQuery += " ORDER BY engagement_rate DESC"
	case "likes":
		baseQuery += " ORDER BY likes DESC"
	case "views":
		baseQuery += " ORDER BY views DESC"
	case "reposts":
		baseQuery += " ORDER BY reposts DESC"
	case "newest":
		baseQuery += " ORDER BY created_at DESC"
	default:
		baseQuery += " ORDER BY created_at DESC"
	}

	if limit > 0 {
		baseQuery += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, limit)
	}

	rows, err := DB.Query(baseQuery, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var t Tweet
		var rawEmbedding pq.Float64Array
		var createdAtRaw interface{}

		err := rows.Scan(
			&t.ID,
			&t.Text,
			&t.Author,
			&t.Followers,
			&t.Likes,
			&t.Replies,
			&t.Reposts,
			&t.Views,
			&t.EngagementRate,
			&t.Pattern,
			&rawEmbedding,
			&t.URL,
			&createdAtRaw,
			&t.IsViral,
			&t.IsCandidate,
			&t.HookText,
			&t.HookType,
			&t.StructureNotes,
			&t.LabelSource,
		)
		if err != nil {
			return nil, err
		}

		t.Embedding = []float64(rawEmbedding)
		
		// Parse timestamp string/time object nicely
		if tTime, ok := createdAtRaw.(string); ok {
			t.CreatedAt = tTime
		} else if tTimeBytes, ok := createdAtRaw.([]byte); ok {
			t.CreatedAt = string(tTimeBytes)
		} else {
			t.CreatedAt = fmt.Sprintf("%v", createdAtRaw)
		}

		tweets = append(tweets, t)
	}

	return tweets, nil
}

// GetAllEmbeddings retrieves all tweets that have embeddings for in-memory cosine similarity search
func GetAllEmbeddings() ([]Tweet, error) {
	query := `SELECT id, text, author, followers, likes, replies, reposts, views, engagement_rate, pattern, embedding, url, created_at, is_viral, is_candidate, hook_text, hook_type, structure_notes, label_source FROM tweets WHERE embedding IS NOT NULL;`
	rows, err := DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tweets []Tweet
	for rows.Next() {
		var t Tweet
		var rawEmbedding pq.Float64Array
		var createdAtRaw interface{}

		err := rows.Scan(
			&t.ID,
			&t.Text,
			&t.Author,
			&t.Followers,
			&t.Likes,
			&t.Replies,
			&t.Reposts,
			&t.Views,
			&t.EngagementRate,
			&t.Pattern,
			&rawEmbedding,
			&t.URL,
			&createdAtRaw,
			&t.IsViral,
			&t.IsCandidate,
			&t.HookText,
			&t.HookType,
			&t.StructureNotes,
			&t.LabelSource,
		)
		if err != nil {
			return nil, err
		}

		t.Embedding = []float64(rawEmbedding)
		
		if tTime, ok := createdAtRaw.(string); ok {
			t.CreatedAt = tTime
		} else if tTimeBytes, ok := createdAtRaw.([]byte); ok {
			t.CreatedAt = string(tTimeBytes)
		} else {
			t.CreatedAt = fmt.Sprintf("%v", createdAtRaw)
		}

		tweets = append(tweets, t)
	}
	return tweets, nil
}

// DeleteTweet removes a tweet from the database by ID
func DeleteTweet(id string) error {
	query := `DELETE FROM tweets WHERE id = $1;`
	_, err := DB.Exec(query, id)
	return err
}
