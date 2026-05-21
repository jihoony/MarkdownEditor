# 마크다운 에디터 보안 취약점 점검 보고서

소스 코드를 분석한 결과, 데스크톱 애플리케이션(Wails 기반)의 구조적 특성과 프론트엔드-백엔드 간의 통신에서 발생하는 **치명적인 보안 취약점 3건**이 발견되었습니다.

## 1. 발견된 취약점 요약

| 심각도 | 취약점 유형 | 관련 파일 | CWE |
| :---: | :--- | :--- | :--- |
| **HIGH** | 크로스 사이트 스크립팅 (XSS) | `frontend/src/App.tsx` | CWE-79 |
| **HIGH** | 임의 파일 읽기 (Arbitrary File Read) | `app.go` | CWE-22, CWE-73 |
| **HIGH** | 임의 파일 쓰기 (Arbitrary File Write) | `app.go` | CWE-22, CWE-73 |

---

## 2. 취약점 상세 분석

### 2.1. Unsanitized Markdown Rendering (XSS)
- **위치**: `frontend/src/App.tsx` 내 `dangerouslySetInnerHTML={{ __html: html }}`
- **설명**: `marked` 라이브러리를 통해 변환된 HTML 콘텐츠를 React의 `dangerouslySetInnerHTML`을 통해 뷰어에 렌더링하고 있습니다. 이때 변환된 HTML에 대한 살균(Sanitization) 과정이 없기 때문에, 악의적으로 조작된 마크다운 파일(예: `<script>alert(1)</script>` 포함)을 열 경우 에디터 내에서 임의의 자바스크립트가 실행될 수 있습니다.
- **위험성**: 이 XSS 취약점은 아래에 설명된 백엔드 파일 입출력 API와 결합될 경우, 시스템 전체를 장악할 수 있는 가장 심각한 트리거 역할을 합니다.

### 2.2. 임의 파일 읽기 (Arbitrary File Read)
- **위치**: `app.go`의 `ReadFile(filepath string)` 함수
- **설명**: 프론트엔드에서 전달받은 `filepath`를 별도의 검증 없이 `os.ReadFile`로 바로 읽어들입니다.
- **위험성**: 만약 해커가 악성 마크다운 파일로 XSS 공격에 성공한다면, 프론트엔드 자바스크립트에서 Wails API인 `ReadFile("/etc/shadow")`나 사용자 개인 파일 경로 등을 마음대로 호출하여 컴퓨터 내의 모든 중요 정보를 탈취할 수 있습니다. (데스크톱 앱 특성상 시스템 권한을 그대로 가지기 때문입니다)

### 2.3. 임의 파일 쓰기 (Arbitrary File Write)
- **위치**: `app.go`의 `SaveFile(content string, filepath string)` 함수
- **설명**: `filepath` 파라미터가 비어있지 않으면 시스템 기본 저장 다이얼로그(Dialog)를 무시하고 해당 경로(`filepath`)에 `content`를 덮어씌웁니다.
- **위험성**: XSS를 통해 프론트엔드를 장악한 공격자는 악의적인 스크립트나 백도어를 시스템의 시작 프로그램 폴더(`~/.bashrc` 등)에 강제로 덮어써, 실질적인 **원격 코드 실행(RCE, Remote Code Execution)** 상태를 만들어낼 수 있습니다.

---

## 3. 권고되는 조치 방안 (Remediation)

1. **프론트엔드 XSS 방어 (DOMPurify 적용)**
   - `marked`로 변환된 HTML을 `dangerouslySetInnerHTML`에 주입하기 전에, **DOMPurify**와 같은 검증된 라이브러리를 사용하여 악성 스크립트 태그를 완벽하게 제거(Sanitize)해야 합니다.
   - `npm install dompurify @types/dompurify`

2. **백엔드 파일 접근 제어 (API 디자인 수정)**
   - 자바스크립트 단에서 직접 로컬 절대 경로를 인자로 넘겨 읽거나 쓰게 하는 `ReadFile`, `SaveFile(..., filepath)` 함수는 데스크톱 앱에서 가장 위험한 패턴입니다.
   - 윈도우/리눅스 파일 시스템 접근은 반드시 백엔드(Go)에서 띄운 네이티브 파일 다이얼로그(`runtime.OpenFileDialog`, `runtime.SaveFileDialog`)를 통해서만 파일 경로를 얻도록 강제해야 합니다.
   - 또는 프론트엔드에서 경로를 넘길 수 밖에 없는 구조(예: 최근 열린 파일 목록 등)라면, 애플리케이션 내부에 "승인된 파일 경로 리스트(Allowed Path List)" 상태를 두고, 사용자가 직접 다이얼로그로 선택했던 파일 경로가 아니면 읽기/쓰기를 거부하는 보안 로직이 추가되어야 합니다.
