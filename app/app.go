package main

import (
	"context"
	"os"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// OpenFile opens a file dialog and reads the content of the selected file.
func (a *App) OpenFile() (map[string]string, error) {
	options := runtime.OpenDialogOptions{
		Title: "Open Markdown File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown Files (*.md)", Pattern: "*.md"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	}
	filepath, err := runtime.OpenFileDialog(a.ctx, options)
	if err != nil {
		return nil, err
	}
	if filepath == "" {
		// User cancelled
		return map[string]string{"filepath": "", "content": ""}, nil
	}

	content, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}

	return map[string]string{
		"filepath": filepath,
		"content":  string(content),
	}, nil
}

// ReadFile reads the content of a file given its absolute path.
func (a *App) ReadFile(filepath string) (map[string]string, error) {
	content, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"filepath": filepath,
		"content":  string(content),
	}, nil
}

// SaveFile saves the content to the given filepath. If filepath is empty, it opens a save dialog.
func (a *App) SaveFile(content string, filepath string) (string, error) {
	if filepath == "" {
		options := runtime.SaveDialogOptions{
			Title: "Save Markdown File",
			DefaultFilename: "untitled.md",
			Filters: []runtime.FileFilter{
				{DisplayName: "Markdown Files (*.md)", Pattern: "*.md"},
			},
		}
		selectedPath, err := runtime.SaveFileDialog(a.ctx, options)
		if err != nil {
			return "", err
		}
		if selectedPath == "" {
			// User cancelled
			return "", nil
		}
		filepath = selectedPath
	}

	err := os.WriteFile(filepath, []byte(content), 0644)
	if err != nil {
		return "", err
	}

	return filepath, nil
}
