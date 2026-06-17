package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
)

//go:embed dashboard/*
var dashboardFS embed.FS

func main() {
	log.Println("Starting Tweet Collector Backend...")

	// Initialize database
	if err := InitDB(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}

	// Register API handlers
	http.HandleFunc("/save", saveTweetHandler)
	http.HandleFunc("/tweets", listTweetsHandler)
	http.HandleFunc("/search-semantic", semanticSearchHandler)
	http.HandleFunc("/generate", generateTweetHandler)
	http.HandleFunc("/delete", deleteTweetHandler)

	// Serve static files for Dashboard using go:embed
	subFS, err := fs.Sub(dashboardFS, "dashboard")
	if err != nil {
		log.Fatalf("Failed to load embedded dashboard directory: %v", err)
	}
	http.Handle("/", http.FileServer(http.FS(subFS)))

	// Check configuration
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	openaiKey := os.Getenv("OPENAI_API_KEY")
	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")

	log.Println("==================================================")
	log.Printf("Server listening on http://localhost:%s", port)
	
	if openaiKey != "" {
		log.Println("✅ OpenAI integration: ACTIVE (Embeddings & Completion)")
	} else {
		log.Println("⚠️  OpenAI integration: INACTIVE (No semantic search or backup classification)")
	}

	if anthropicKey != "" {
		log.Println("✅ Claude integration: ACTIVE (Pattern classification & template generation)")
	} else {
		log.Println("⚠️  Claude integration: INACTIVE (Will fallback to OpenAI or Unclassified)")
	}

	if openaiKey == "" && anthropicKey == "" {
		log.Println("📢 Running in LOCAL ONLY mode. Tweets will be collected without classifications/embeddings.")
	}
	log.Println("==================================================")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
