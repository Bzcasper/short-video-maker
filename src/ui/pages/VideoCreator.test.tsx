import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import VideoCreator from "./VideoCreator";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";

jest.mock("axios");

describe("VideoCreator Component", () => {
  test("renders VideoCreator component", () => {
    render(
      <MemoryRouter>
        <VideoCreator />
      </MemoryRouter>,
    );
    expect(screen.getByText("Create New Video")).toBeInTheDocument();
  });

  test("adds a new scene when Add Scene button is clicked", () => {
    render(
      <MemoryRouter>
        <VideoCreator />
      </MemoryRouter>,
    );
    const addButton = screen.getByRole("button", { name: /Add Scene/i });
    fireEvent.click(addButton);
    expect(screen.getAllByText(/Scene \d/)).toHaveLength(2);
  });

  test("submits form and navigates on successful video creation", async () => {
    const mockPost = jest
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { videoId: "test-id" } });
    render(
      <MemoryRouter>
        <VideoCreator />
      </MemoryRouter>,
    );
    const createButton = screen.getByRole("button", { name: /Create Video/i });
    fireEvent.click(createButton);
    expect(mockPost).toHaveBeenCalled();
  });

  test("displays community assets button", () => {
    render(
      <MemoryRouter>
        <VideoCreator />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: /Browse Community Assets/i }),
    ).toBeInTheDocument();
  });
});

