#include <bits/stdc++.h>
using namespace std;

void clearScreen() {
    system("cls"); 
}

vector<int> generateRandomSecret() {
    vector<int> digits = {1, 2, 3, 4, 5, 6, 7, 8, 9};
    random_device rd;
    mt19937 g(rd());
    shuffle(digits.begin(), digits.end(), g);
    digits.resize(4);
    return digits;
}

vector<int> getValidInput(string prompt) {
    string input;
    while (true) {
        cout << prompt;
        cin >> input;

        if (input.length() != 4) {
            cout << "Invalid input: Please enter exactly 4 digits." << endl;
            continue;
        }

        bool validFormat = true;
        set<char> uniqueCheck;

        for (char c : input) {
            if (!isdigit(c)) {
                cout << "Invalid input: Numbers only." << endl;
                validFormat = false;
                break;
            }
            if (c == '0') {
                cout << "Invalid input: 0 is not allowed." << endl;
                validFormat = false;
                break;
            }
            uniqueCheck.insert(c);
        }

        if (!validFormat) continue;

        if (uniqueCheck.size() != 4) {
            cout << "Invalid input: Digits must be unique (no repeats)." << endl;
            continue;
        }

        vector<int> guess;
        for (char c : input) {
            guess.push_back(c - '0'); 
        }
        return guess;
    }
}

void checkGuess(vector<int> guess, vector<int> secret, int &pos, int &num) {
    pos = 0;
    num = 0;

    for (int i = 0; i < 4; i++) {
        if (guess[i] == secret[i]) {
            pos++;
        }
    }

    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4; j++) {
            if (guess[i] == secret[j]) {
                num++;
                break; 
            }
        }
    }
}

void playSinglePlayer() {
    clearScreen();
    cout << "=== SINGLE PLAYER MODE ===" << endl;
    cout << "I have chosen 4 unique numbers between 1-9." << endl;

    vector<int> secret = generateRandomSecret();
    int attempts = 0;
    bool solved = false;

    while (!solved) {
        vector<int> guess = getValidInput("Enter your guess: ");
        attempts++;

        int pos, num;
        checkGuess(guess, secret, pos, num);

        if (pos == 4) {
            cout << "\nCONGRATULATIONS! You found the number in " << attempts << " attempts!" << endl;
            cout << "The number was: ";
            for(int n : secret) cout << n;
            cout << endl << endl;
            solved = true;
        } else {
            cout << "Result: " << pos << " Position(s), " << num << " Number(s)" << endl;
            cout << "-------------------------------------------" << endl;
        }
    }
}

void playTwoPlayer() {
    clearScreen();
    cout << "=== TWO PLAYER MODE ===" << endl;

    cout << "PLAYER 1: Set your secret number." << endl;
    vector<int> p1Secret = getValidInput("P1 Secret (4 digits): ");
    cout << "Secret set! Press Enter to clear screen for Player 2...";
    cin.ignore(); cin.get();
    clearScreen();

    cout << "PLAYER 2: Set your secret number." << endl;
    vector<int> p2Secret = getValidInput("P2 Secret (4 digits): ");
    cout << "Secret set! Press Enter to start the game...";
    cin.ignore(); cin.get();
    clearScreen();

    cout << "=== GAME START ===" << endl;
    
    bool gameOver = false;
    int turn = 1; // 1 = P1, 2 = P2

    while (!gameOver) {
        if (turn == 1) {
            cout << "\n[PLAYER 1's TURN] (Guessing P2's Secret)" << endl;
            vector<int> guess = getValidInput("P1 Guess: ");
            
            int pos, num;
            checkGuess(guess, p2Secret, pos, num);

            if (pos == 4) {
                cout << "\n*********************************" << endl;
                cout << "🎉 PLAYER 1 WINS! 🎉" << endl;
                cout << "*********************************" << endl;
                gameOver = true;
            } else {
                cout << "P1 Result: " << pos << " Position(s), " << num << " Number(s)" << endl;
                turn = 2; 
            }

        } else {
            cout << "\n[PLAYER 2's TURN] (Guessing P1's Secret)" << endl;
            vector<int> guess = getValidInput("P2 Guess: ");
            
            int pos, num;
            checkGuess(guess, p1Secret, pos, num);

            if (pos == 4) {
                cout << "\n*********************************" << endl;
                cout << "🎉 PLAYER 2 WINS! 🎉" << endl;
                cout << "*********************************" << endl;
                gameOver = true;
            } else {
                cout << "P2 Result: " << pos << " Position(s), " << num << " Number(s)" << endl;
                turn = 1; 
            }
        }
    }

    cout << "\nGame Over!" << endl;
    cout << "Player 1's Secret was: ";
    for(int n : p1Secret) cout << n;
    cout << "\nPlayer 2's Secret was: ";
    for(int n : p2Secret) cout << n;
    cout << endl << endl;
}

int main() {
    while (true) {
        cout << "===========================" << endl;
        cout << "   CRACK THE CODE    " << endl;
        cout << "===========================" << endl;
        cout << "1. Play Single Player" << endl;
        cout << "2. Play Two Players" << endl;
        cout << "3. Exit" << endl;
        cout << "Select Option: ";

        int choice;
        cin >> choice;

        if (cin.fail()) {
            cin.clear(); 
            cin.ignore(1000, '\n'); 
            continue;
        }

        if (choice == 1) {
            playSinglePlayer();
        } else if (choice == 2) {
            playTwoPlayer();
        } else if (choice == 3) {
            cout << "Thanks for playing!" << endl;
            break;
        } else {
            cout << "Invalid option!" << endl;
        }
        
        cout << "Press Enter to return to menu...";
        cin.ignore(); cin.get();
        clearScreen();
    }
    return 0;
}