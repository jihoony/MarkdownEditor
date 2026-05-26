package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/transform"
)

func readFileWithEncoding(content []byte) string {
	if utf8.Valid(content) {
		return string(content)
	}
	
	reader := transform.NewReader(bytes.NewReader(content), korean.EUCKR.NewDecoder())
	decodedContent, err := io.ReadAll(reader)
	if err == nil {
		return string(decodedContent)
	}
	
	return string(content)
}

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

func isAllowedFileExtension(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".md" || ext == ".txt" || ext == ".markdown"
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
		"content":  readFileWithEncoding(content),
	}, nil
}

// ReadFile reads the content of a file given its absolute path.
func (a *App) ReadFile(filepath string) (map[string]string, error) {
	if !isAllowedFileExtension(filepath) {
		return nil, errors.New("security restriction: only markdown or text files can be read")
	}

	content, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"filepath": filepath,
		"content":  readFileWithEncoding(content),
	}, nil
}

// SaveFile saves the content to the given filepath. If filepath is empty, it opens a save dialog.
func (a *App) SaveFile(content string, file_path string) (string, error) {
	if file_path == "" {
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
		file_path = selectedPath
	} else {
		if !isAllowedFileExtension(file_path) {
			return "", errors.New("security restriction: only markdown or text files can be saved")
		}
	}

	err := os.WriteFile(file_path, []byte(content), 0644)
	if err != nil {
		return "", err
	}

	return file_path, nil
}

// SaveImage saves a base64 encoded image to an 'images' folder next to the markdown file
func (a *App) SaveImage(base64Data string, mdFilePath string, originalName string) (string, error) {
	if mdFilePath == "" {
		return "", errors.New("markdown file path is empty")
	}

	imgData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", err
	}

	mdDir := filepath.Dir(mdFilePath)
	imagesDir := filepath.Join(mdDir, "images")

	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		return "", err
	}

	ext := filepath.Ext(originalName)
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("img_%d%s", time.Now().UnixMilli(), ext)
	fullImagePath := filepath.Join(imagesDir, filename)

	if err := os.WriteFile(fullImagePath, imgData, 0644); err != nil {
		return "", err
	}

	return "images/" + filename, nil
}

// CopyImageToWorkspace copies a dropped image to the 'images' folder next to the markdown file
func (a *App) CopyImageToWorkspace(sourcePath string, mdFilePath string) (string, error) {
	if mdFilePath == "" {
		return "", errors.New("markdown file path is empty")
	}

	sourceFile, err := os.Open(sourcePath)
	if err != nil {
		return "", err
	}
	defer sourceFile.Close()

	mdDir := filepath.Dir(mdFilePath)
	imagesDir := filepath.Join(mdDir, "images")

	if err := os.MkdirAll(imagesDir, 0755); err != nil {
		return "", err
	}

	ext := filepath.Ext(sourcePath)
	filename := fmt.Sprintf("img_%d%s", time.Now().UnixMilli(), ext)
	fullImagePath := filepath.Join(imagesDir, filename)

	destFile, err := os.Create(fullImagePath)
	if err != nil {
		return "", err
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, sourceFile); err != nil {
		return "", err
	}

	return "images/" + filename, nil
}
