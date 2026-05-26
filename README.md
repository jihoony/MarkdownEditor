# 크로스 플랫폼 마크다운 에디터 (Cross-Platform Markdown Editor)

**Wails (Go)** 와 **React (TypeScript)** 를 기반으로 제작된 빠르고 가벼우며 다양한 기능을 갖춘 크로스 플랫폼 데스크톱 마크다운 에디터입니다.
실시간 미리보기, 강력한 단축키 지원, 그리고 기본 내장된 Mermaid 다이어그램 렌더링을 통해 최적의 문서 작성 경험을 제공합니다.

## 주요 기능
- **실시간 미리보기 및 양방향 스크롤 동기화**: 좌측에서 코드를 작성하면 우측에 즉시 결과가 반영됩니다. 또한 양쪽 화면의 스크롤 위치가 항상 일치하도록 비례 동기화(Proportional Sync)됩니다.
- **코드 구문 강조 (Syntax Highlighting)**: 소스코드 편집기(Monaco Editor) 및 뷰어(highlight.js) 양쪽 모두에서 전문적인 문법 하이라이팅을 지원합니다.
- **Mermaid 다이어그램 지원**: 복잡한 순서도와 다이어그램을 마크다운 코드 블록으로 작성하여 즉시 렌더링할 수 있습니다.
- **고급 목차 (TOC) 사이드바**: 문서 내의 제목(H1~H6)을 자동으로 추출하여 클릭 가능한 목차 트리를 사이드바에 생성합니다.
- **표(Table) 생성기 GUI**: 마크다운 표를 일일이 그릴 필요 없이, 내장된 팝업 UI를 통해 행과 열의 갯수만 입력하면 쉽게 표를 삽입할 수 있습니다.
- **PDF 내보내기 및 인쇄**: UI 요소(사이드바, 툴바 등)를 숨기고 뷰어의 텍스트만 깔끔하게 출력하는 인쇄 모드를 지원합니다.
- **이미지 자동 저장 및 붙여넣기**: 클립보드의 이미지(`Ctrl+V`)를 붙여넣거나 사진 파일을 드래그 앤 드롭하면 로컬 `images/` 폴더에 이미지를 안전하게 자동 저장하고 문법을 삽입합니다.
- **수식(Math) 렌더링 지원 (KaTeX)**: `$` 또는 `$$`로 감싼 수학 수식을 빠르고 정확하게 렌더링하여 과학/수학 문서를 손쉽게 작성할 수 있습니다.
- **다크 모드 (Dark Theme)**: 눈을 편안하게 해주는 고품질 다크 모드를 지원하며, 단축키(`Ctrl+Shift+D`)를 통해 언제든지 토글할 수 있습니다.
- **파일 탐색기 및 다중 탭 사이드바**: 현재 작업 중인 폴더의 마크다운 파일 목록을 볼 수 있는 'Explorer' 탭과 'Outline' 탭을 지원하며, 사이드바의 크기를 마우스로 조절할 수 있습니다.
- **스마트 토글 단축키**: 문맥을 파악하여 `**` 등의 마크다운 기호를 자동으로 씌우고 벗겨내는(Toggle) 지능형 서식 단축키(`Ctrl+B`, `Ctrl+I` 등)를 지원합니다.
- **에디터 내장 검색 (Search)**: 강력한 텍스트 검색 및 치환 위젯 (Ctrl+F) 지원.
- **강력한 운영체제 호환 단축키**: OS나 키보드 레이아웃, 리눅스 데스크톱 환경에 상관없이 서식 단축키가 완벽하게 동작하도록 하위 레벨 키 코드로 매핑되어 있습니다.
- **드래그 앤 드롭 파일 열기**: PC에 있는 `.md` 파일을 에디터 창 위로 끌어다 놓기만 하면 즉시 열립니다.
- **강력한 시스템 보안 (Security Hardened)**: `DOMPurify`를 통한 철저한 XSS 방어 처리와 안전한 확장자(`.md`, `.txt`) 전용 파일 입출력 검증이 적용되어 있어 안심하고 외부 문서를 열 수 있습니다.

## 기술 스택
- **Backend (백엔드)**: Go, Wails v2
- **Frontend (프론트엔드)**: React, TypeScript, Vite
- **핵심 라이브러리**: 
  - `@monaco-editor/react` (소스코드 에디터 엔진)
  - `marked` (마크다운 파서)
  - `mermaid` (다이어그램 렌더러)
  - `highlight.js` (뷰어 구문 강조)

## 개발 및 빌드 환경 준비
- [Go](https://golang.org/doc/install) (1.18 버전 이상)
- [Node.js](https://nodejs.org/) (16 버전 이상)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest` 명령어로 설치)

## 개발 모드 실행
실시간으로 코드를 수정하며 테스트하려면 프로젝트 루트 폴더에서 다음 명령어를 실행하세요:
```bash
wails dev
```

## 릴리즈 배포 및 빌드 방법
사용자 배포용 단일 실행 파일을 생성하려면 다음 명령어를 사용합니다:
```bash
# 기본 빌드 (wails.json 설정에 따라 MarkdownEditor 실행 파일 생성)
wails build

# 출력 파일 이름을 명시적으로 지정하여 빌드
wails build -o MarkdownEditor

# 프로덕션 최적화 빌드 (에셋 압축 및 코드 난독화 적용)
wails build -clean -upx -ldflags "-s -w"
```
빌드된 실행 파일(`MarkdownEditor` 또는 `MarkdownEditor.exe`)은 `build/bin/` 디렉토리에 생성됩니다.

### 리눅스(Linux) 환경 앱 아이콘 등록 안내
리눅스 파일 탐색기에서는 실행 파일 자체가 아이콘을 포함할 수 없기 때문에 기본 톱니바퀴 아이콘으로 보입니다. 시작 메뉴와 작업 표시줄에 앱 아이콘이 정상적으로 표시되도록 하려면 `.desktop` 파일을 생성해야 합니다.

터미널에서 다음 내용을 `~/.local/share/applications/markdowneditor.desktop` 경로에 저장하세요.
(경로는 본인의 프로젝트 위치에 맞게 수정하세요)
```ini
[Desktop Entry]
Name=Markdown Editor
Comment=A cross-platform Markdown Editor
Exec=/절대경로/MarkdownEditor/app/build/bin/MarkdownEditor %U
Icon=/절대경로/MarkdownEditor/app/assets/appicon.png
Terminal=false
Type=Application
Categories=Office;TextEditor;Utility;
StartupWMClass=MarkdownEditor
```
저장 후 `chmod +x ~/.local/share/applications/markdowneditor.desktop` 명령어를 실행하면 리눅스 시작 메뉴에서 Markdown Editor를 검색 및 실행할 수 있습니다.

### 크로스 컴파일 (타 OS용 빌드)
Wails는 현재 OS와 다른 플랫폼용 빌드를 지원합니다 (예: 리눅스 환경에서 윈도우 `.exe` 파일 빌드):
```bash
# 리눅스나 macOS에서 Windows용 실행 파일 빌드
wails build -platform windows/amd64
```
*(참고: 리눅스에서 윈도우용으로 빌드하려면 `mingw-w64` 등의 추가 툴체인이 필요할 수 있으며, macOS용 컴파일은 반드시 Mac 기기에서 진행해야 합니다).*
